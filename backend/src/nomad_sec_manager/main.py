import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pymongo import AsyncMongoClient
from pymongo.errors import ConnectionFailure

from .analysis import AnalysisStore
from .analysis import router as analysis_router
from .github import GitHubError
from .repositories import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_port = os.environ.get("NOMAD_MONGO_PORT", "28547")
    mongo_uri = os.environ.get("NOMAD_MONGO_URI", f"mongodb://127.0.0.1:{mongo_port}")
    database = os.environ.get("NOMAD_MONGO_DATABASE", "nomad_sec_manager")
    async with AsyncMongoClient(
        mongo_uri, tz_aware=True, serverSelectionTimeoutMS=3000
    ) as client:
        app.state.repositories = client[database].repositories
        await app.state.repositories.create_index("github_id", unique=True)
        app.state.analysis = AnalysisStore(client[database])
        async with app.state.analysis.worker():
            yield


app = FastAPI(title="NOMAD Security Manager", lifespan=lifespan)
app.include_router(router)
app.include_router(analysis_router)


@app.exception_handler(GitHubError)
async def github_error(request: Request, error: GitHubError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content={"detail": str(error)})


@app.exception_handler(ConnectionFailure)
async def database_unavailable(
    request: Request, error: ConnectionFailure
) -> JSONResponse:
    return JSONResponse(
        status_code=503, content={"detail": "Repository storage is unavailable."}
    )


def dev() -> None:
    uvicorn.run(
        "nomad_sec_manager.main:app",
        host="127.0.0.1",
        port=int(os.environ.get("NOMAD_API_PORT", "18542")),
        reload=True,
        reload_dirs=[str(Path(__file__).resolve().parent)],
    )
