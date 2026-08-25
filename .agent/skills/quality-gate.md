---
name: quality-gate
description: Run jaxx doctor --quality before commits; fix violations or justify threshold changes in DECISIONS.md.
trigger: before every commit
allowedTools:
  - read
  - bash
version: 1.0.0
---

# quality-gate

## Why
The quality gate keeps the codebase inside agreed complexity and duplication
budgets. It is deterministic: same code, same verdict, same exit code.

## Procedure

### 1. Before committing, run in order
```bash
npm run build                                # must compile clean
npx vitest run                               # all tests green
jaxx doctor --quality                        # gate must PASS (exit 0)
```

### 2. If the gate FAILS
Violations are listed per function, e.g.
`complexity 12 > 10: src/foo.ts#handleBar`.

Resolution order (do not skip steps):
1. **Refactor** the flagged function: extract helpers, replace conditional
   chains with lookup tables, early-return instead of nested ifs.
2. Re-run the gate. Repeat until PASS.
3. Only if a threshold is genuinely wrong for the project (not for your
   convenience): propose a change in `.agent/DECISIONS.md` as an ADR, get
   human approval, then update `frame.config.ts > quality`.

### 3. Never do this
- Never add `// eslint-disable`-style suppressions to dodge the gate.
- Never raise thresholds in the same commit as the code that violated them.
- Never commit with the gate failing, even "temporarily".

## Exit codes (contract)
`0` pass · `1` gate violated · `2` usage · `3` config error · `4` internal.
