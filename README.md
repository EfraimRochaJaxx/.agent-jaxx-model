# Agent Jaxx Model

A reusable, whitelabel agent-engineering framework. Drop it into any software
project to get an **agent control plane**: persistent project memory, an
append-only audit log, quality gates, a skills registry, dashboard
observability, and optional multi-agent orchestration.

> Agent Jaxx Model manages itself through its own `.agent/` directory — it is
> its first real consumer.

## What it solves

Autonomous coding agents fail at scale because state lives in conversation
context. Agent Jaxx Model moves that state into the repository:

| Problem | Solution |
| ------- | -------- |
| Agents forget to log actions | `Session` lifecycle + `jaxx log` with schema validation |
| Branching documented but not enforced | `jaxx doctor` checks branches/trees; conventions live in `BRANCHING.md` |
| No CI/quality gates | `jaxx doctor --quality` with threshold-driven exit codes |
| Hardcoded dashboards | Fully whitelabel `frame.config.ts` |
| Skills scattered | Versionable skills registry with a strict trust model |
| No complexity analysis | ts-morph cyclomatic complexity, dead-code and duplication reports |
| No multi-agent layer | Optional LangGraph bridge sharing the same control plane |

## Packages

| Package | Purpose |
| ------- | ------- |
| `@jaxx/core` | Zod schemas, frame config loading, sessions, append-only log, file locking, safe git helpers |
| `@jaxx/cli` | `jaxx init`, `log`, `doctor`, `skill add/list/install` |
| `@jaxx/analyzers` | Cyclomatic complexity, approximate dead code & duplication; JSON + Markdown scorecards |
| `@jaxx/dashboard` | Whitelabel React 18 + Tailwind 3 control center on a native Node HTTP server |
| `@jaxx/langgraph-bridge` | Optional Python 3.11+ FastAPI/LangGraph orchestrator sharing the audit log |

## Installation

Requires Node 20+. From the monorepo root:

```bash
npm install
npm run build        # core + cli + analyzers
npm run dashboard:build
```

The CLI is available at `packages/cli/dist/index.js` (publish or `npm link`
as needed).

## Quick start

```bash
cd your-project
npx @jaxx/cli init "Your Project"

# record what agents do
jaxx log INFO "implemented login endpoint" --agent coder-1

# verify environment, git, docker, config, control plane, quality
jaxx doctor --quality

# observe everything
node node_modules/@jaxx/dashboard/dist/server/server.js   # http://localhost:3099
```

## Control plane concept

`jaxx init` creates `.agent/`:

```
.agent/
├── STATE.md          current status — agents read this first
├── PLAN.md           roadmap / milestones
├── PROGRESS.md       completed-work history
├── DECISIONS.md      lightweight ADRs
├── VERIFICATION.md   auto-appended session summaries
├── BRANCHING.md      branch conventions
├── COLLABORATION.md  human/agent coordination protocol
├── AGENT_LOG.jsonl   append-only audit log
├── skills/           skill registry (markdown + YAML frontmatter)
└── frame.config.ts   THE whitelabel configuration surface
```

## State management

Agents follow the loop:

1. **Read** `STATE.md`, `PLAN.md`, recent `AGENT_LOG.jsonl`.
2. **Work** on one branch per feature per agent.
3. **Record** events (`jaxx log <lvl> "<msg>" --agent <name>`).
4. **Close sessions** — a `Session` writes an automatic summary to
   `VERIFICATION.md`.
5. **Update state**, commit, push.

Conflict resolution for shared files is `git pull --rebase`; JSONL lines are
independent so rebases resolve automatically.

## Append-only audit log

Every entry validates against:

```json
{ "ts": "ISO8601", "lvl": "INFO|WARN|ERROR|DONE|AGENT|GIT", "agent": "string", "msg": "string" }
```

Guarantees: validated writes under an advisory file lock (concurrent-safe);
tolerant reads that **never destroy malformed historical data**; integrity
reporting via `jaxx doctor`.

## Quality gates

```bash
jaxx doctor --quality            # human report, exit != 0 on violations
jaxx doctor --quality --json     # machine-readable scorecard
```

Analyzers (ts-morph based):

- **cyclomatic complexity** per function (default threshold 10);
- **approximate dead code** (exports never referenced elsewhere);
- **approximate duplication** (normalized sliding-window hashes).

Scorecards persist to `.agent/quality/latest.json` and `latest.md`. Configure
thresholds in `frame.config.ts` under `quality`.

## Dashboard

Native `node:http` server + Vite-built React SPA. Reads everything from the
target project's `.agent/`: agent log (10s polling), git status per repo,
docker container status, skills registry, quality scorecards, token countdown,
and project branding/theme from `frame.config.ts`. Binds to 127.0.0.1 only.

```bash
node packages/dashboard/dist/server/server.js --root /path/to/project
```

## Multi-agent bridge (optional)

Python FastAPI app running an orchestrator → coder/reviewer/qa LangGraph.
Every node appends to the same `AGENT_LOG.jsonl`. See
[packages/langgraph-bridge/README.md](packages/langgraph-bridge/README.md).

## Configuration

Everything project-specific lives in `frame.config.ts` (see
[frame.config.example.ts](frame.config.example.ts)): project name/logo, theme,
repos, docker containers, dashboard port, quality thresholds, token countdown.
The framework ships zero hardcoded project assumptions.

## Security model

See [docs/security.md](docs/security.md). Highlights:

- External skills are **untrusted input** — validated data, never executed.
- All git/docker calls use argument arrays, no shell interpolation.
- The dashboard API is read-only and jailed to the project directory.
- The audit log preserves corrupted entries instead of rewriting them.

## Development

```bash
npm install
npm run build      # tsc -b core cli analyzers
npm test           # vitest (42 TS tests)
cd packages/langgraph-bridge && python -m pytest -q   # 6 python tests
node scripts/clean-room.mjs   # end-to-end acceptance suite (26 checks)
```

Exit-code contract for agents/CI: `0` ok · `1` check failed · `2` usage ·
`3` config · `4` internal.

## Roadmap

- [ ] Publish packages to npm
- [ ] GitHub Action wrapping `doctor --quality` as a CI gate
- [ ] Real LLM wiring example for the bridge nodes
- [ ] Cross-machine lock coordination options
- [ ] Dashboard websocket push (currently 10s polling)
