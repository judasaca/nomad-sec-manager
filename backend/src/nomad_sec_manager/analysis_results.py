from datetime import datetime
from typing import Literal, Self

from nomad_sec_ops.models import AnalysisStatus
from pydantic import BaseModel, Field

ResultStatus = Literal[
    "queued", "running", "clean", "findings", "not_evaluated", "failed", "incomplete"
]
STEP_SUMMARY_PROJECTION = {"steps.findings": 0, "steps.dependency_audit": 0}


def completed_status(statuses: set[AnalysisStatus], has_findings: bool) -> ResultStatus:
    if statuses == {AnalysisStatus.ERROR}:
        return "failed"
    if has_findings or AnalysisStatus.FINDINGS in statuses:
        return "findings"
    if AnalysisStatus.PASSED in statuses:
        return "clean"
    if not statuses or statuses == {AnalysisStatus.SKIPPED}:
        return "not_evaluated"
    return "incomplete"


class StepDiagnostic(BaseModel):
    name: str
    status: Literal["error", "not_evaluated", "skipped"]
    message: str


class SeverityCounts(BaseModel):
    high: int = 0
    medium: int = 0
    low: int = 0
    informational: int = 0
    unavailable: int = 0


class PythonCounts(BaseModel):
    vulnerabilities: int = 0
    project_status_findings: int = 0


class AnalysisSummary(BaseModel):
    id: str
    repository_id: str
    repository_name: str
    global_run_id: str | None
    status: ResultStatus
    diagnostics: list[StepDiagnostic] = Field(default_factory=list)
    counts: SeverityCounts | None = None
    ci_cd_count: int | None = None
    python_counts: PythonCounts | None = None
    branch: str | None = None
    commit: str | None = None
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None

    @classmethod
    def from_document(cls, document: dict) -> Self:
        group_id = document["global_run_id"]
        fields = {}
        if "steps" in document and document["status"] not in ("queued", "running"):
            steps = document["steps"]
            statuses = {AnalysisStatus(step["status"]) for step in steps}
            status = completed_status(
                statuses, any((document.get("counts") or {}).values())
            )
            diagnostic_statuses = {AnalysisStatus.ERROR, AnalysisStatus.NOT_EVALUATED}
            if status == "not_evaluated":
                diagnostic_statuses.add(AnalysisStatus.SKIPPED)
            fields = {
                "status": status,
                "diagnostics": [
                    step for step in steps if step["status"] in diagnostic_statuses
                ],
            }
        return cls.model_validate(
            {
                **document,
                **fields,
                "id": str(document["_id"]),
                "repository_id": str(document["repository_id"]),
                "global_run_id": str(group_id) if group_id is not None else None,
            }
        )


def published_result_groups() -> list[dict]:
    # The group document publishes all of its results together on standalone MongoDB.
    return [
        {
            "$lookup": {
                "from": "global_runs",
                "localField": "global_run_id",
                "foreignField": "_id",
                "pipeline": [{"$match": {"deleting": {"$ne": True}}}],
                "as": "_group",
            }
        },
        {"$match": {"$or": [{"global_run_id": None}, {"_group.0": {"$exists": True}}]}},
        {"$unset": "_group"},
    ]
