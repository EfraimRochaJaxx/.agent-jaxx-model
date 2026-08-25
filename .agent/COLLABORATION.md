# Collaboration Guide

## How agents coordinate
1. Read STATE.md, PLAN.md and recent AGENT_LOG.jsonl entries at start.
2. Pick unclaimed work from PLAN.md.
3. Create a branch following BRANCHING.md.
4. Append events while working (`jaxx log <lvl> "<msg>" --agent <name>`).
5. Close sessions so VERIFICATION.md gets an automatic summary.
6. Push; sync via Git, never via shared folders.

## Human-agent split
Humans approve PRs and set direction in PLAN.md.
Agents implement, verify, log and report.
