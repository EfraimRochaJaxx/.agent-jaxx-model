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
  - Deterministic Audit Trail Gate:
  - Added `checkAuditTrail` in `doctor.ts` & `verify.ts` to enforce that any staged code changes must be accompanied by an audit entry in `.agent/`.
  - 4 new unit tests in `packages/cli/test/verify-audit.test.ts`.

## Test totals
- TypeScript: 66 vitest tests green (12 suites).
- Python bridge: 6 pytest tests green.
- Clean-room E2E: 26 checks green.
- Quality gate: PASS (`doctor --quality` / `jaxx verify`).
- Browser UI: 100% functional & verified.

## Next steps (post-release backlog)
See PLAN.md M8+ candidates: npm registry publish, websocket push option, real LLM wiring example for the bridge.

## Blockers
None. Ready for public open-source release.
