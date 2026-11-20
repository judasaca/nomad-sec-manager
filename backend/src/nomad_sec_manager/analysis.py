import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from typing import Annotated, Literal, Self

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from nomad_sec_ops import AnalysisError, AnalysisReport, static_analysis
from nomad_sec_ops.models import AnalysisStatus, Finding
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import ConnectionFailure, DocumentTooLarge, PyMongoError
from starlette.concurrency import run_in_threadpool

from .repositories import find_repository, repository_id

router = APIRouter(prefix="/api", tags=["static analysis"])
logger = logging.getLogger(__name__)

ResultStatus = Literal[
    "queued", "running", "clean", "findings", "not_evaluated", "failed"
]


class SeverityCounts(BaseModel):
    high: int = 0
    medium: int = 0
    low: int = 0
    informational: int = 0


class AnalysisSummary(BaseModel):
    id: str
    repository_id: str
    repository_name: str
    global_run_id: str | None
    status: ResultStatus
    counts: SeverityCounts = Field(default_factory=SeverityCounts)
    branch: str | None = None
    commit: str | None = None
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None

    @classmethod
    def from_document(cls, document: dict) -> Self:
        group_id = document["global_run_id"]
        return cls.model_validate(
            {
                **document,
                "id": str(document["_id"]),
                "repository_id": str(document["repository_id"]),
                "global_run_id": str(group_id) if group_id is not None else None,
            }
        )


class AnalysisStep(BaseModel):
    name: str
    status: AnalysisStatus
    message: str
    findings: list[Finding]


class AnalysisResult(AnalysisSummary):
    steps: list[AnalysisStep] = Field(default_factory=list)


class GlobalRun(BaseModel):
    id: str
    created_at: datetime
    repository_count: int

    @classmethod
    def from_document(cls, document: dict) -> Self:
        return cls(id=str(document["_id"]), **document)


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
        )
        for step in report.steps
    ]
    counts = SeverityCounts().model_dump()
    for step in steps:
        for finding in step.findings:
            counts[finding.severity] += 1

    statuses = {step.status for step in steps}
    if AnalysisStatus.ERROR in statuses:
        status = "failed"
    elif AnalysisStatus.NOT_EVALUATED in statuses:
        status = "not_evaluated"
    elif any(counts.values()):
        status = "findings"
    elif AnalysisStatus.PASSED in statuses:
        status = "clean"
    else:
        status = "not_evaluated"

    return {
        "status": status,
        "counts": counts,
        "branch": report.repository.branch if report.repository else None,
        "commit": report.repository.commit if report.repository else None,
        "steps": [step.model_dump(mode="json") for step in steps],
    }


class AnalysisStore:
    def __init__(self, database: AsyncDatabase):
        self.repositories = database.repositories
        self.results = database.analysis_results
        self.global_runs = database.global_runs

    @asynccontextmanager
    async def worker(self):
        await self.results.create_index(
            [("repository_id", 1), ("created_at", -1), ("_id", -1)]
        )
        await self.results.create_index("global_run_id")
        await self.results.create_index([("status", 1), ("created_at", 1), ("_id", 1)])
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
    def published_results() -> list[dict]:
        # The group document publishes all of its results together on standalone MongoDB.
        return [
            {
                "$lookup": {
                    "from": "global_runs",
                    "localField": "global_run_id",
                    "foreignField": "_id",
                    "as": "_group",
                }
            },
            {
                "$match": {
                    "$or": [{"global_run_id": None}, {"_group.0": {"$exists": True}}]
                }
            },
            {"$unset": "_group"},
        ]

    async def process_queue(self) -> None:
        while True:
            try:
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
            {"$project": {"steps": 0}},
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
    now = datetime.now(UTC)
    group_id = ObjectId()
    results = [
        store.new_result(repository, now, group_id)
        async for repository in store.repositories.find(
            {}, {"full_name": 1, "url": 1}
        ).sort("full_name")
    ]
    if not results:
        raise HTTPException(409, "Add a repository before starting a global run.")
    group = {"_id": group_id, "created_at": now, "repository_count": len(results)}
    await store.results.insert_many(results)
    await store.global_runs.insert_one(group)
    return GlobalRun.from_document(group)


@router.get("/global-runs")
async def list_global_runs(store: Store) -> list[GlobalRun]:
    return [
        GlobalRun.from_document(group)
        async for group in store.global_runs.find().sort(
            [("created_at", -1), ("_id", -1)]
        )
    ]


@router.get("/global-runs/{id}")
async def get_global_run(id: str, store: Store) -> GlobalRunDetails:
    missing = "Global run not found."
    group_id = analysis_id(id, missing)
    group = await store.global_runs.find_one({"_id": group_id})
    if group is None:
        raise HTTPException(404, missing)
    results = [
        AnalysisSummary.from_document(result)
        async for result in store.results.find(
            {"global_run_id": group_id}, {"steps": 0}
        ).sort("repository_name")
    ]
    return GlobalRunDetails(
        **GlobalRun.from_document(group).model_dump(),
        clean_count=sum(result.status == "clean" for result in results),
        results=results,
    )
