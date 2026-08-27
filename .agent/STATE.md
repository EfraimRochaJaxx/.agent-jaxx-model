# State — Agent Jaxx Model

## Status
PUBLIC_RELEASE — ACTIVE_GOVERNANCE (CI Green · Ruleset Protected)

## Product
Agent Jaxx Model — whitelabel autonomous agent engineering framework (TypeScript monorepo + optional Python bridge).

## Completed (all 6 phases + pre-release audit + Architecture Impact Graph)
- Phase 1: @jaxx/core — schemas, config, sessions, append-only log, locking. Commit 7ac5566.
- Phase 2: @jaxx/cli — init/log/doctor/verify/skills/session, deterministic exit codes.
- Phase 3: @jaxx/dashboard — native HTTP server + React18/Tailwind3 SPA with interactive Architecture & Impact Graph.
- Phase 4: @jaxx/analyzers — AST dependency graph, blast radius calculation, complexity/dead-code/duplication.
- Phase 5: skills registry hardened — 7 security boundary tests, trust model. Commit 0fbbb7e.
- Phase 6: @jaxx/langgraph-bridge — FastAPI/LangGraph sharing the same log; cross-language verified. Commit 806f88e.
- Architecture Impact Graph & Pre-Commit Hardening:
  - AST dependency analyzer & transitive blast radius engine in `@jaxx/analyzers`.
  - Interactive SVG/Canvas Architecture & Dependency Graph + Impact Inspector in `@jaxx/dashboard`.
  - `jaxx verify` command & automated `.git/hooks/pre-commit` installation in `init.ts`.
  - Updated `AGENTS.md`, `README.md`, and new `CONTRIBUTING.md`.
  - Multi-Repo Workspace Linking: `jaxx repo add/list/remove`.
  - Deterministic Pre-Commit Verification Pipeline:
    - Audit Trail Gate: Mandates `.agent/` audit updates for any staged code changes.
    - AST Blast Radius Impact Gate: Warns on modified modules without staged downstream test coverage.
    - Anti-Bypass Shield:
      - Installs `.git/hooks/pre-commit` and `.git/hooks/pre-push` running `npx jaxx verify`.
      - `.gitignore` integrity gate: Rejects commits if `.agent/` is placed in `.gitignore`.
      - Automated `.github/workflows/jaxx-ci.yml` generation in `jaxx init`.
    - 68 unit tests passing across 13 suites.

## Test totals
- TypeScript: 68 vitest tests green (13 suites).
- Python bridge: 6 pytest tests green.
- Clean-room E2E: 26 checks green.
- Quality gate: PASS (`doctor --quality` / `jaxx verify`).
- Browser UI: 100% functional & verified.

## Next steps (post-release backlog)
See PLAN.md M8+ candidates: npm registry publish, websocket push option, real LLM wiring example for the bridge.

## Blockers
None. Ready for public open-source release.
