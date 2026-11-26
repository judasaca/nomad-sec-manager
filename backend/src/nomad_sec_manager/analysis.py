import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from typing import Annotated, Self

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from nomad_sec_ops import AnalysisError, AnalysisReport, static_analysis
from nomad_sec_ops.models import AnalysisStatus, DependencyAudit, Finding
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import ConnectionFailure, DocumentTooLarge, PyMongoError
from starlette.concurrency import run_in_threadpool

from .analysis_results import (
    STEP_SUMMARY_PROJECTION,
    AnalysisSummary,
    PythonCounts,
    SeverityCounts,
    completed_status,
    published_result_groups,
)
from .repositories import find_repository, repository_id, visible_repository

router = APIRouter(prefix="/api", tags=["static analysis"])
logger = logging.getLogger(__name__)


class AnalysisStep(BaseModel):
    name: str
    status: AnalysisStatus
    message: str
    findings: list[Finding]
    dependency_audit: DependencyAudit | None = None


class AnalysisResult(AnalysisSummary):
    steps: list[AnalysisStep] = Field(default_factory=list)


class GlobalRun(BaseModel):
    id: str
    created_at: datetime
    repository_count: int

    @classmethod
    def from_document(cls, document: dict) -> Self:
        return cls(id=str(document["_id"]), **document)


class GlobalRunSummary(GlobalRun):
    active_count: int = 0
    evaluated_count: int = 0
    counts: SeverityCounts | None = None
    ci_cd_count: int | None = None
    python_counts: PythonCounts | None = None


class GlobalRunDetails(GlobalRun):
    clean_count: int
    results: list[AnalysisSummary]


def report_fields(report: AnalysisReport) -> dict:
    steps = [
        AnalysisStep(
            name=step.name,
            status=step.result.status,
            message=step.result.message,
            findings=step.result.findings,
            dependency_audit=step.result.dependency_audit,
        )
        for step in report.steps
    ]
    counts = SeverityCounts().model_dump()
    ci_cd_count = 0
    ci_cd_evaluated = False
    python_audited = False
    python_counts = PythonCounts()
    evaluated_statuses = {AnalysisStatus.PASSED, AnalysisStatus.FINDINGS}
    for step in steps:
        ci_cd_evaluated |= step.name == "ci-cd" and step.status in evaluated_statuses
        if step.name == "python-dependencies":
            python_audited |= step.dependency_audit is not None
        for finding in step.findings:
            counts[finding.severity or "unavailable"] += 1
            if finding.kind == "ci-cd":
                ci_cd_count += 1
            elif step.name == "python-dependencies":
                if finding.kind == "dependency-vulnerability":
                    python_counts.vulnerabilities += 1
                elif finding.kind == "dependency-project-status":
                    python_counts.project_status_findings += 1

    statuses = {step.status for step in steps}
    evaluated = not statuses.isdisjoint(evaluated_statuses)
    has_findings = any(counts.values())
    return {
        "status": completed_status(statuses, has_findings),
        "counts": counts if evaluated or has_findings else None,
        "ci_cd_count": ci_cd_count if ci_cd_evaluated or ci_cd_count else None,
        "python_counts": python_counts.model_dump()
        if python_audited
        or python_counts.vulnerabilities
        or python_counts.project_status_findings
        else None,
        "branch": report.repository.branch if report.repository else None,
        "commit": report.repository.commit if report.repository else None,
        "steps": [step.model_dump(mode="json") for step in steps],
    }


class AnalysisStore:
    def __init__(self, database: AsyncDatabase):
        self.repositories = database.repositories
        self.results = database.analysis_results
        self.global_runs = database.global_runs
        self.repository_changes = asyncio.Lock()

    @asynccontextmanager
    async def worker(self):
        await self.results.create_index(
            [("repository_id", 1), ("created_at", -1), ("_id", -1)]
        )
        await self.results.create_index("global_run_id")
        await self.results.create_index([("status", 1), ("created_at", 1), ("_id", 1)])
        await self.global_runs.create_index("deleting", sparse=True)
        await self.repositories.create_index("deleting", sparse=True)
        await self.results.update_many(
            {"status": "running"},
            {
                "$set": {
                    "status": "failed",
                    "error": "The backend stopped before this scan finished.",
                    "finished_at": datetime.now(UTC),
                }
            },
        )
        task = asyncio.create_task(self.process_queue())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    @staticmethod
    def new_result(
        repository: dict, now: datetime, global_run_id: ObjectId | None = None
    ) -> dict:
        return {
            "_id": ObjectId(),
            "repository_id": repository["_id"],
            "repository_name": repository["full_name"],
            "repository_url": repository["url"],
            "global_run_id": global_run_id,
            "status": "queued",
            "created_at": now,
        }

    @staticmethod
    def results_for_visible_repositories() -> list[dict]:
        return [
            {
                "$lookup": {
                    "from": "repositories",
                    "localField": "repository_id",
                    "foreignField": "_id",
                    "pipeline": [
                        {"$match": visible_repository},
                        {"$project": {"_id": 1}},
                    ],
                    "as": "_repository",
                }
            },
            {"$match": {"_repository.0": {"$exists": True}}},
            {"$unset": "_repository"},
        ]

    @classmethod
    def published_results(cls) -> list[dict]:
        return [
            *cls.results_for_visible_repositories(),
            *published_result_groups(),
        ]

    async def process_queue(self) -> None:
        while True:
            try:
                async for repository in self.repositories.find(
                    {"deleting": True}, {"_id": 1}
                ):
                    await self.purge_repository(repository["_id"])
                async for group in self.global_runs.find(
                    {"deleting": True}, {"_id": 1}
                ):
                    await self.purge_global_run(group["_id"])
                cursor = await self.results.aggregate(
                    [
                        {"$match": {"status": "queued"}},
                        {"$sort": {"created_at": 1, "_id": 1}},
                        *self.published_results(),
                        {"$limit": 1},
                        {"$project": {"_id": 1}},
                    ]
                )
                candidate = await anext(cursor, None)
                await cursor.close()
                if candidate is not None:
                    result = await self.results.find_one_and_update(
                        {"_id": candidate["_id"], "status": "queued"},
                        {"$set": {"status": "running"}},
                        return_document=ReturnDocument.AFTER,
                    )
                    if result is not None:
                        await self.scan(result)
                    continue
            except PyMongoError:
                logger.exception("Could not process the static analysis queue")
            await asyncio.sleep(1)

    async def delete_repository(self, id: ObjectId) -> None:
        # Serialize this marker with scan admission in the single backend process.
        async with self.repository_changes:
            marked = await self.repositories.update_one(
                {"_id": id}, {"$set": {"deleting": True}}
            )
        if marked.matched_count == 0:
            raise HTTPException(404, "Saved repository not found.")
        await self.purge_repository(id)

    async def purge_repository(self, id: ObjectId) -> None:
        await self.results.delete_many({"repository_id": id})
        await self.repositories.delete_one({"_id": id, "deleting": True})

    async def purge_global_run(self, group_id: ObjectId) -> None:
        # Keep the hidden group until its reports are gone so deletion can resume.
        await self.results.delete_many({"global_run_id": group_id})
        await self.global_runs.delete_one({"_id": group_id, "deleting": True})

    async def scan(self, result: dict) -> None:
        try:
            report = await run_in_threadpool(
                static_analysis, repo=result["repository_url"]
            )
            fields = report_fields(report)
        except AnalysisError as error:
            fields = {"status": "failed", "error": str(error)}
        except Exception:
            logger.exception("Static analysis failed for result %s", result["_id"])
            fields = {"status": "failed", "error": "The scanner failed unexpectedly."}

        try:
            await self.finish(result["_id"], fields)
        except DocumentTooLarge:
            await self.finish(
                result["_id"],
                {
                    "status": "failed",
                    "error": "The report exceeded MongoDB's size limit.",
                },
            )

        except PyMongoError:
            logger.exception("Could not save static analysis report %s", result["_id"])
            await self.finish(
                result["_id"],
                {
                    "status": "failed",
                    "error": "The backend could not save this report.",
                },
            )

    async def finish(self, result_id: ObjectId, fields: dict) -> None:
        while True:
            try:
                await self.results.update_one(
                    {"_id": result_id, "status": "running"},
                    {"$set": {**fields, "finished_at": datetime.now(UTC)}},
                )
                return
            except ConnectionFailure:
                logger.exception("Could not save static analysis result %s", result_id)
                await asyncio.sleep(5)


def analysis_store(request: Request) -> AnalysisStore:
    return request.app.state.analysis


Store = Annotated[AnalysisStore, Depends(analysis_store)]


def analysis_id(value: str, detail: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(404, detail)
    return ObjectId(value)


@router.post("/repositories/{id}/analysis-results", status_code=202)
async def start_repository_analysis(id: str, store: Store) -> AnalysisSummary:
    async with store.repository_changes:
        repository = await find_repository(store.repositories, repository_id(id))
        result = store.new_result(repository, datetime.now(UTC))
        await store.results.insert_one(result)
    return AnalysisSummary.from_document(result)


@router.get("/repositories/{id}/analysis-results")
async def repository_analysis_history(id: str, store: Store) -> list[AnalysisSummary]:
    object_id = repository_id(id)
    cursor = await store.results.aggregate(
        [
            {"$match": {"repository_id": object_id}},
            {"$sort": {"created_at": -1, "_id": -1}},
            {"$project": STEP_SUMMARY_PROJECTION},
            *store.published_results(),
        ]
    )
    results = [AnalysisSummary.from_document(result) async for result in cursor]
    if not results:
        await find_repository(store.repositories, object_id)
    return results


@router.get("/analysis-results/{id}")
async def get_analysis_result(id: str, store: Store) -> AnalysisResult:
    missing = "Analysis result not found."
    cursor = await store.results.aggregate(
        [{"$match": {"_id": analysis_id(id, missing)}}, *store.published_results()]
    )
    result = await anext(cursor, None)
    await cursor.close()
    if result is None:
        raise HTTPException(404, missing)
    return AnalysisResult.from_document(result)


@router.post("/global-runs", status_code=202)
async def start_global_run(store: Store) -> GlobalRun:
    async with store.repository_changes:
        now = datetime.now(UTC)
        group_id = ObjectId()
        results = [
            store.new_result(repository, now, group_id)
            async for repository in store.repositories.find(
                visible_repository, {"full_name": 1, "url": 1}
            ).sort("full_name")
        ]
        if not results:
            raise HTTPException(409, "Add a repository before starting a global run.")
        group = {"_id": group_id, "created_at": now, "repository_count": len(results)}
        await store.results.insert_many(results)
        await store.global_runs.insert_one(group)
    return GlobalRun.from_document(group)


@router.get("/global-runs")
async def list_global_runs(store: Store) -> list[GlobalRunSummary]:
    severities = SeverityCounts.model_fields
    python_categories = PythonCounts.model_fields
    evaluated = {
        "$and": [
            {"$in": ["$status", ["clean", "findings"]]},
            {
                "$eq": [
                    {
                        "$setIntersection": [
                            {"$ifNull": ["$steps.status", []]},
                            ["error", "not_evaluated"],
                        ]
                    },
                    [],
                ]
            },
        ]
    }
    count_fields = ("counts", "ci_cd_count", "python_counts")
    cursor = await store.global_runs.aggregate(
        [
            {"$match": {"deleting": {"$ne": True}}},
            {"$sort": {"created_at": -1, "_id": -1}},
            {
                "$lookup": {
                    "from": "analysis_results",
                    "localField": "_id",
                    "foreignField": "global_run_id",
                    "pipeline": [
                        {
                            "$project": {
                                "repository_id": 1,
                                "status": 1,
                                "steps.status": 1,
                                **dict.fromkeys(count_fields, 1),
                            }
                        },
                        *store.results_for_visible_repositories(),
                        {
                            "$group": {
                                "_id": None,
                                "active_count": {
                                    "$sum": {
                                        "$cond": [
                                            {"$in": ["$status", ["queued", "running"]]},
                                            1,
                                            0,
                                        ]
                                    }
                                },
                                "evaluated_count": {
                                    "$sum": {"$cond": [evaluated, 1, 0]}
                                },
                                **{
                                    f"has_{field}": {
                                        "$max": {
                                            "$ne": [
                                                {"$ifNull": [f"${field}", None]},
                                                None,
                                            ]
                                        }
                                    }
                                    for field in count_fields
                                },
                                "ci_cd_count": {"$sum": "$ci_cd_count"},
                                **{
                                    severity: {"$sum": f"$counts.{severity}"}
                                    for severity in severities
                                },
                                **{
                                    category: {"$sum": f"$python_counts.{category}"}
                                    for category in python_categories
                                },
                            }
                        },
                    ],
                    "as": "report_totals",
                }
            },
        ]
    )
    runs = []
    async for group in cursor:
        totals = next(iter(group.pop("report_totals")), {})
        active_count = totals.get("active_count", 0)
        runs.append(
            GlobalRunSummary.from_document(
                {
                    **group,
                    "active_count": active_count,
                    "evaluated_count": totals.get("evaluated_count", 0),
                    "counts": {severity: totals[severity] for severity in severities}
                    if not active_count and totals.get("has_counts")
                    else None,
                    "ci_cd_count": totals["ci_cd_count"]
                    if not active_count and totals.get("has_ci_cd_count")
                    else None,
                    "python_counts": {
                        category: totals[category] for category in python_categories
                    }
                    if not active_count and totals.get("has_python_counts")
                    else None,
                }
            )
        )
    return runs


@router.get("/global-runs/{id}")
async def get_global_run(id: str, store: Store) -> GlobalRunDetails:
    missing = "Global run not found."
    group_id = analysis_id(id, missing)
    visible_group = {"_id": group_id, "deleting": {"$ne": True}}
    group = await store.global_runs.find_one(visible_group)
    if group is None:
        raise HTTPException(404, missing)
    cursor = await store.results.aggregate(
        [
            {"$match": {"global_run_id": group_id}},
            {"$sort": {"repository_name": 1}},
            {"$project": STEP_SUMMARY_PROJECTION},
            *store.published_results(),
        ]
    )
    results = [AnalysisSummary.from_document(result) async for result in cursor]
    if await store.global_runs.find_one(visible_group, {"_id": 1}) is None:
        raise HTTPException(404, missing)
    return GlobalRunDetails(
        **GlobalRun.from_document(group).model_dump(),
        clean_count=sum(result.status == "clean" for result in results),
        results=results,
    )


@router.delete("/global-runs/{id}", status_code=204)
async def delete_global_run(id: str, store: Store) -> Response:
    missing = "Global run not found."
    group_id = analysis_id(id, missing)
    # Standalone MongoDB cannot transact across the two collections.
    marked = await store.global_runs.update_one(
        {"_id": group_id}, {"$set": {"deleting": True}}
    )
    if marked.matched_count == 0:
        raise HTTPException(404, missing)
    await store.purge_global_run(group_id)
    return Response(status_code=204)
