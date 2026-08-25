"""Local REST interface for the bridge.

Run:
    uvicorn jaxx_bridge.server:app --port 3100 --root <project>

Endpoints mirror the TypeScript dashboard API surface where relevant.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException

from .graph import run_goal
from .log import ControlPlane
from .schemas import RunRequest, RunResponse

app = FastAPI(title="Agent Jaxx Bridge", version="0.1.0")
_plane: Optional[ControlPlane] = None


def resolve_root() -> Path:
    argv = os.environ.get("JAXX_ROOT") or _arg_root()
    return Path(argv).resolve()


def _arg_root() -> str:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=os.getcwd())
    args, _unknown = parser.parse_known_args()
    return args.root


def get_plane() -> ControlPlane:
    global _plane
    if _plane is None:
        root = resolve_root()
        _plane = ControlPlane(root)
        if not (_plane.agent_dir / "STATE.md").exists():
            raise RuntimeError(f"no control plane at {root} — run `jaxx init` first")
    return _plane


@app.get("/health")
def health() -> dict:
    return {"ok": True, "bridge": "langgraph"}


@app.get("/events")
def events(limit: int = 100) -> dict:
    if not 1 <= limit <= 1000:
        raise HTTPException(status_code=400, detail="limit must be 1..1000")
    return {"events": get_plane().read_events(limit)}


@app.get("/state")
def state() -> dict:
    content = get_plane().read_state()
    if content is None:
        raise HTTPException(status_code=404, detail="STATE.md not found")
    return {"content": content}


@app.post("/run", response_model=RunResponse)
def run(req: RunRequest) -> RunResponse:
    try:
        final = run_goal(get_plane(), req.goal)
    except TimeoutError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return RunResponse(
        ok=True,
        events_appended=len(final.get("plan", [])) + 4,
        summary=f"plan={final.get('plan')} qa={final.get('qa_result')}",
    )
