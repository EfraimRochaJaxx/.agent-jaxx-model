# Branching Strategy

- `main` — always shippable. Protected where possible.
- `feature/<slug>` — one feature per branch per agent.
- `fix/<slug>` — bug fixes.
- Merge via PR; fast-forward rebase preferred for shared logs.

## Enforcement
Run `jaxx doctor` to verify expected branches exist and working
trees are clean before starting work.

## Conflict resolution strategy
For shared control-plane files (AGENT_LOG.jsonl): append-only plus
`git pull --rebase`. JSONL lines are independent, so rebases resolve
automatically.
