# Plan

High-level roadmap. Ordered by priority.

## Milestones

### M1 — Framework core (DONE)
- [x] Monorepo scaffold (npm workspaces)
- [x] @jaxx/core: schemas, config, sessions, append-only log, locking

### M2 — CLI (DONE)
- [x] jaxx init / log / doctor with deterministic exit codes and --json
- [x] Skills registry command surface (add/list/install)

### M3 — Dashboard observability
- [ ] Whitelabel Vite+React18+Tailwind3 dashboard served by native HTTP server
- [ ] Agent log polling, git status, docker status, token countdown, skills, quality views

### M4 — Quality gates
- [ ] @jaxx/analyzers: cyclomatic complexity, dead code, duplication
- [ ] doctor --quality gate with threshold-driven exit codes

### M5 — Skills hardening
- [ ] Safe external installation tests (malicious frontmatter, traversal, symlinks)
- [ ] Trust model documentation

### M6 — Multi-agent bridge
- [ ] @jaxx/langgraph-bridge: orchestrator -> coder/reviewer/qa appending shared events
- [ ] REST interface mirroring core schemas

### M7 — Acceptance & audit
- [ ] Clean-room acceptance test in a fresh temp project
- [ ] Security review + whitelabel invariant scan
- [ ] README + docs/

## Working agreements
- One feature = one branch = one agent.
- Every meaningful action is appended to AGENT_LOG.jsonl.
- Conflict resolution for shared files: `git pull --rebase`.

