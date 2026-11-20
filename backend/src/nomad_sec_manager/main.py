import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI

app = FastAPI(title="NOMAD Security Manager")


def dev() -> None:
    uvicorn.run(
        "nomad_sec_manager.main:app",
        host="127.0.0.1",
        port=int(os.environ.get("NOMAD_API_PORT", "18542")),
        reload=True,
        reload_dirs=[str(Path(__file__).resolve().parent)],
    )
