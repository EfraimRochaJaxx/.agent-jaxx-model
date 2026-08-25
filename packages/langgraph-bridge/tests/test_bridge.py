"""Bridge tests. Skips graph/API tests when optional deps are missing."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from jaxx_bridge.log import ControlPlane
from jaxx_bridge.schemas import Event


@pytest.fixture()
def project(tmp_path: Path) -> Path:
    (tmp_path / ".agent").mkdir()
    (tmp_path / ".agent" / "STATE.md").write_text("# State\n\nREADY\n", encoding="utf-8")
    return tmp_path


def test_event_schema_matches_typescript_contract():
    ev = Event.now(lvl="INFO", agent="bridge-test", msg="hello")
    obj = json.loads(ev.model_dump_json())
    assert set(obj.keys()) == {"ts", "lvl", "agent", "msg"}
    assert obj["lvl"] in ("INFO", "WARN", "ERROR", "DONE", "AGENT", "GIT")


def test_append_and_tolerant_read(project: Path):
    plane = ControlPlane(project)
    plane.append_event("INFO", "first", agent="t")
    plane.append_event("DONE", "second", agent="t")
    # Corrupt the log with a malformed line — reads must tolerate it.
    with open(plane.log_path, "a", encoding="utf-8") as f:
        f.write("GARBAGE LINE\n")
    events = plane.read_events()
    assert [e["msg"] for e in events] == ["first", "second"]


def test_concurrent_writers_no_lost_lines(project: Path):
    import threading

    plane = ControlPlane(project)

    def worker(i: int) -> None:
        for j in range(10):
            plane.append_event("INFO", f"w{i}-m{j}", agent=f"a{i}")

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(plane.read_events(limit=1000)) == 60


def test_state_read(project: Path):
    plane = ControlPlane(project)
    assert "READY" in plane.read_state()


# ---- API + graph tests (require fastapi/langgraph) ----------------------

try:
    from fastapi.testclient import TestClient  # noqa: E402

    import os
    from jaxx_bridge import server as bridge_server  # noqa: E402

    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False


@pytest.mark.skipif(not HAS_DEPS, reason="fastapi/langgraph not installed")
def test_rest_interface_and_graph_shares_log(project: Path, monkeypatch):
    monkeypatch.setenv("JAXX_ROOT", str(project))
    bridge_server._plane = None  # reset cached plane for this root
    client = TestClient(bridge_server.app)

    assert client.get("/health").json()["ok"] is True

    res = client.post("/run", json={"goal": "add fibonacci module"})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True

    events = client.get("/events?limit=100").json()["events"]
    agents = {e["agent"] for e in events}
    assert {"orchestrator", "coder", "reviewer", "qa"} <= agents
    # The same log the TypeScript side reads:
    raw = (project / ".agent" / "AGENT_LOG.jsonl").read_text(encoding="utf-8").splitlines()
    parsed = [json.loads(l) for l in raw if l.strip()]
    assert any(e["lvl"] == "DONE" for e in parsed)


@pytest.mark.skipif(not HAS_DEPS, reason="fastapi not installed")
def test_run_rejects_empty_goal(project: Path, monkeypatch):
    monkeypatch.setenv("JAXX_ROOT", str(project))
    bridge_server._plane = None
    client = TestClient(bridge_server.app)
    res = client.post("/run", json={"goal": ""})
    assert res.status_code == 422
