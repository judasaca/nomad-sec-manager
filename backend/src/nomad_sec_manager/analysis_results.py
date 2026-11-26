from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel

ResultStatus = Literal[
    "queued", "running", "clean", "findings", "not_evaluated", "failed"
]


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
        return cls.model_validate(
            {
                **document,
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
