from datetime import UTC, datetime
from typing import Annotated, Self

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints
from pymongo import ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from .github import RepositoryMetadata, fetch_repository, normalize_repository_url

router = APIRouter(prefix="/api/repositories", tags=["repositories"])

RepositoryURL = Annotated[
    str, StringConstraints(max_length=500), AfterValidator(normalize_repository_url)
]


class RepositoryImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: RepositoryURL


class RepositoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: RepositoryURL | None = None


class Repository(RepositoryMetadata):
    id: str
    created_at: datetime
    metadata_updated_at: datetime

    @classmethod
    def from_document(cls, document: dict) -> Self:
        return cls(id=str(document["_id"]), **document)


def repository_collection(request: Request) -> AsyncCollection:
    return request.app.state.repositories


Collection = Annotated[AsyncCollection, Depends(repository_collection)]


def repository_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(404, "Saved repository not found.")
    return ObjectId(value)


async def find_repository(collection: AsyncCollection, id: ObjectId) -> dict:
    document = await collection.find_one({"_id": id})
    if document is None:
        raise HTTPException(404, "Saved repository not found.")
    return document


@router.get("")
async def list_repositories(collection: Collection) -> list[Repository]:
    return [
        Repository.from_document(document)
        async for document in collection.find().sort([("created_at", -1), ("_id", -1)])
    ]


@router.post("", status_code=201)
async def create_repository(
    body: RepositoryImport, collection: Collection
) -> Repository:
    metadata = await run_in_threadpool(fetch_repository, body.url)
    now = datetime.now(UTC)
    # MongoDB stores dates at millisecond precision.
    now = now.replace(microsecond=now.microsecond // 1000 * 1000)
    document = {**metadata.model_dump(), "created_at": now, "metadata_updated_at": now}
    try:
        inserted = await collection.insert_one(document)
    except DuplicateKeyError as error:
        raise HTTPException(409, "This GitHub repository is already saved.") from error
    return Repository(id=str(inserted.inserted_id), **document)


@router.get("/{id}")
async def get_repository(id: str, collection: Collection) -> Repository:
    return Repository.from_document(
        await find_repository(collection, repository_id(id))
    )


@router.patch("/{id}")
async def update_repository(
    id: str, body: RepositoryUpdate, collection: Collection
) -> Repository:
    object_id = repository_id(id)
    current = await find_repository(collection, object_id)
    metadata = await run_in_threadpool(
        fetch_repository, body.url or current["github_id"]
    )
    fields = {**metadata.model_dump(), "metadata_updated_at": datetime.now(UTC)}
    try:
        updated = await collection.find_one_and_update(
            {
                "_id": object_id,
                "github_id": current["github_id"],
                "metadata_updated_at": current["metadata_updated_at"],
            },
            {"$set": fields},
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as error:
        raise HTTPException(409, "This GitHub repository is already saved.") from error
    if updated is None:
        await find_repository(collection, object_id)
        raise HTTPException(409, "This repository changed. Reload it and try again.")
    return Repository.from_document(updated)


@router.delete("/{id}", status_code=204)
async def delete_repository(id: str, collection: Collection) -> Response:
    result = await collection.delete_one({"_id": repository_id(id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Saved repository not found.")
    return Response(status_code=204)
