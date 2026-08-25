---
name: session-discipline
description: Open a Session at start, record events during work, close sessions so VERIFICATION.md gets an automatic summary.
trigger: beginning and end of any meaningful work block
allowedTools:
  - read
  - edit
  - bash
version: 1.0.0
---

# session-discipline

## Why
Sessions turn scattered agent activity into auditable evidence. VERIFICATION.md
becomes the project's proof-of-work history.

## Procedure

### 1. Start of work
```bash
jaxx session open --agent <your-name>
```
- `<your-name>`: stable identity (e.g. `antigravity`, `ox-alpha`, `estagiario`).
- One open session per project per agent. If `.agent.session.json` exists,
  close the stale session first.

### 2. During work
Log every meaningful action, choosing the right level:
- `INFO` — progress notes ("implemented login endpoint")
- `GIT` — commits and branch operations ("commit abc1234 on feat/login")
- `WARN` — problems worked around ("flaky test skipped: auth.spec#3")
- `ERROR` — failures needing attention ("migration failed on clean DB")
- `DONE` — completed milestones ("checkout flow verified end-to-end")

```bash
jaxx log <LVL> "<specific message>" --agent <your-name>
```
Messages must be self-contained: an outsider reading AGENT_LOG.jsonl later
must understand what happened without extra context.

### 3. End of work
```bash
jaxx session close --summary "<what was done> — verified by <how>"
```
- The summary is appended to `.agent/VERIFICATION.md` automatically.
- Update `.agent/STATE.md` if project status changed.
- Commit `.agent/` together with the code.

## Guardrails
- NEVER edit or delete lines in AGENT_LOG.jsonl (append-only).
- Do not log secrets, tokens or credentials.
- Do not open a session for trivial read-only exploration.
