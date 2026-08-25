# Plan

High-level roadmap. Ordered by priority.

## Milestones

### M1 — Framework core (DONE)
- [x] Monorepo scaffold (npm workspaces)
- [x] @jaxx/core: schemas, config, sessions, append-only log, locking

### M2 — CLI (DONE)
- [x] jaxx init / log / doctor with deterministic exit codes and --json
- [x] Skills registry command surface (add/list/install)

### M3 — Dashboard observability (DONE)
- [x] Whitelabel Vite+React18+Tailwind3 dashboard served by native HTTP server
- [x] Agent log polling, git status, docker status, token countdown, skills, quality views

### M4 — Quality gates (DONE)
- [x] @jaxx/analyzers: cyclomatic complexity, dead code, duplication
- [x] doctor --quality gate with threshold-driven exit codes

### M5 — Skills hardening (DONE)
- [x] Safe external installation tests (malicious frontmatter, traversal, symlinks)
- [x] Trust model documentation (docs/security.md)

### M6 — Multi-agent bridge (DONE)
- [x] @jaxx/langgraph-bridge: orchestrator -> coder/reviewer/qa appending shared events
- [x] REST interface mirroring core schemas; cross-language logging verified

### M7 — Acceptance & audit (DONE)
- [x] Clean-room acceptance test (scripts/clean-room.mjs, 26 checks)
- [x] Security review + whitelabel invariant scan
- [x] README + docs/

### M8 — Release readiness & packaging (DONE)
- [x] npm publish preparation (bin packaging, files field audit, @jaxx/dashboard metadata)
- [x] GitHub Action wrapping `doctor --quality` and test suites as CI gate (`.github/workflows/ci.yml`)
- [x] Official MIT LICENSE in repository root
- [x] Full visual browser audit of control center dashboard

### M9 — Post-release enhancements
- [ ] Real LLM wiring example for bridge nodes
- [ ] Dashboard websocket push option (currently 10s polling)
- [ ] Cross-machine lock coordination options

## Working agreements
- One feature = one branch = one agent.
- Every meaningful action is appended to AGENT_LOG.jsonl.
- Conflict resolution for shared files: `git pull --rebase`.

