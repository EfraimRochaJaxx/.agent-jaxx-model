# Protocols

## 1. Event log protocol (AGENT_LOG.jsonl)

One JSON object per line, UTF-8, LF line endings:

```json
{"ts":"2026-08-25T14:41:26.465Z","lvl":"INFO","agent":"coder-1","msg":"implemented X"}
```

- `ts`: ISO8601 with timezone offset.
- `lvl`: `INFO | WARN | ERROR | DONE | AGENT | GIT`.
- `agent`: non-empty identity string.
- `msg`: non-empty human/agent-readable text.

Rules:
1. **Append-only.** Never edit or delete existing lines.
2. Validate before writing (`EventSchema` in core; `Event` in the bridge).
3. Writers serialize through `<file>.lock` (advisory, stale-lock aware).
4. Readers skip malformed lines but report them (`malformedLines`).
5. Cross-machine sync: `git pull --rebase` — independent lines merge cleanly.

## 2. Session protocol

```
open   → AGENT event "Session opened (<id>)"
work   → any number of events via Session.record()
close  → DONE event + markdown summary block appended to VERIFICATION.md
```

The summary contains agent id, start/close timestamps, duration, per-level
event counts and the last 50 activity lines. Agents should close sessions at
every meaningful checkpoint so verification evidence accumulates.

## 3. Doctor check protocol

Checks run in a fixed order with four statuses: `pass`, `warn`, `fail`,
`skip`. Exit code is `0` only when no check is `fail`; warnings do not fail.

| # | id prefix | Source |
| - | --------- | ------ |
| 1 | control-plane | required `.agent/` files + log integrity |
| 2 | config | `frame.config.ts` parses against schema |
| 3 | env | keys from `.env.example` present in `.env`/environment |
| 4 | repo:* | repo exists, branch state, clean/dirty tree |
| 5 | branch-protection | optional GitHub probe (`--branch-protection`) |
| 6 | docker | configured containers running (skips when docker absent) |
| 7 | quality | analyzers scorecard (`--quality`) |

Machine output: `jaxx doctor --json` → `{ root, projectName, checks[], ok }`.

Exit codes: `0` ok · `1` failed checks · `2` usage · `3` config error ·
`4` internal.

## 4. Skill format

```markdown
---
name: my-skill            # [a-z0-9][a-z0-9._-]*, no separators that enable traversal
description: one line
trigger: when to apply it
allowedTools:             # declarative metadata only — never executed
  - read
version: 1.0.0            # semver
---

Free-form instructions for agents.
```

Registry commands:

```bash
jaxx skill add <name> [--description ... --trigger ... --tools "read,grep"]
jaxx skill list [--json]
jaxx skill install <https-git-url> [--ref branch]
```

Versioning: skills are plain files inside `.agent/skills/` — commit them to
the consumer repository; the Git history *is* the registry version history.

## 5. Quality gate protocol

`runAnalyzers(root, qualityConfig)` produces a scorecard (JSON) and Markdown
summary persisted under `.agent/quality/latest.{json,md}`.

Gate fails (exit != 0) when:
- any function's cyclomatic complexity > `quality.maxComplexity` (default 10);
- duplication ratio > `quality.maxDuplicationRatio` (default 5%).

Exclusions support `**` / `*` globs; `node_modules`, `dist`, `.d.ts` are always
excluded. Dead-code candidates are advisory only and never fail the gate.

## 6. Bridge protocol

The Python bridge mirrors the event schema exactly (`jaxx_bridge/schemas.py`)
and appends through the same locking discipline. REST surface:
`GET /health`, `GET /events?limit=`, `GET /state`, `POST /run {"goal": ...}`.
Root resolution: `$JAXX_ROOT` or `--root`.
