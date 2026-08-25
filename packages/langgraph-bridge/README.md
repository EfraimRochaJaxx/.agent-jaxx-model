# @jaxx/langgraph-bridge

Optional Python 3.11+ bridge that runs a thin multi-agent graph
(orchestrator → coder → reviewer → qa) against the **same** control plane used
by the TypeScript packages.

## What it shares

- `AGENT_LOG.jsonl` — every node appends schema-validated events (identical
  contract to `@jaxx/core`, see `jaxx_bridge/schemas.py` vs
  `packages/core/src/schemas.ts`).
- `STATE.md`, `VERIFICATION.md` — read-only.
- The project root is resolved from `$JAXX_ROOT` or `--root`.

## Setup

```bash
cd packages/langgraph-bridge
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # POSIX: .venv/bin/pip
```

## Run tests

```bash
.venv/Scripts/python -m pytest -q
```

## REST interface

```bash
JAXX_ROOT=/path/to/project .venv/bin/uvicorn jaxx_bridge.server:app --port 3100
```

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET  | `/health` | liveness |
| GET  | `/events?limit=100` | recent audit events |
| GET  | `/state` | STATE.md contents |
| POST | `/run` `{ "goal": "..." }` | execute the multi-agent graph |

## Design notes

- The bridge is intentionally **thin**: orchestration + logging only. Node
  bodies are deterministic stubs; wire real LLM calls in
  `graph.JaxxGraph.think()` without changing the logging contract.
- Nothing is duplicated from TypeScript except the wire schemas.
- This package is optional; the framework is fully functional without it.
