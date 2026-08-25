import fs from "node:fs";
import path from "node:path";
import { CONTROL_PLANE_FILES, agentDir, skillsDir } from "./paths";

/** Generic, whitelabel control-plane templates. Project specifics live in frame.config.ts. */

const TEMPLATES: Record<string, (name: string) => string> = {
  "STATE.md": (name) => `# State — ${name}

## Status
INITIALIZED

## Current focus
Describe what is currently being worked on.

## Last session
(none)

## Next steps
1. Fill in PLAN.md with the roadmap.
2. Record work in AGENT_LOG.jsonl via \`jaxx log\` or a Session.
3. Update this file when status changes.

## Blockers
None.
`,
  "PLAN.md": () => `# Plan

High-level roadmap. Ordered by priority.

## Milestones

### M1 — <name>
- [ ] Objective one
- [ ] Objective two

## Working agreements
- One feature = one branch = one agent.
- Every meaningful action is appended to AGENT_LOG.jsonl.
- Conflict resolution for shared files: \`git pull --rebase\`.
`,
  "PROGRESS.md": () => `# Progress Log

Reverse-chronological record of completed work.

| Date | Agent | Summary | Evidence |
| ---- | ----- | ------- | -------- |
|      |       |         |          |
`,
  "DECISIONS.md": () => `# Decision Records

Format: lightweight ADRs.

## ADR-001: <title>
- **Date:** YYYY-MM-DD
- **Status:** proposed | accepted | superseded
- **Context:** why this decision was needed
- **Decision:** what was decided
- **Consequences:** trade-offs accepted
`,
  "VERIFICATION.md": () => `# Verification Log

Appended automatically when sessions close. Each entry summarizes
what was done and how it was verified.

---
`,
  "BRANCHING.md": () => `# Branching Strategy

- \`main\` — always shippable. Protected where possible.
- \`feature/<slug>\` — one feature per branch per agent.
- \`fix/<slug>\` — bug fixes.
- Merge via PR; fast-forward rebase preferred for shared logs.

## Enforcement
Run \`jaxx doctor\` to verify expected branches exist and working
trees are clean before starting work.

## Conflict resolution strategy
For shared control-plane files (AGENT_LOG.jsonl): append-only plus
\`git pull --rebase\`. JSONL lines are independent, so rebases resolve
automatically.
`,
  "COLLABORATION.md": () => `# Collaboration Guide

## How agents coordinate
1. Read STATE.md, PLAN.md and recent AGENT_LOG.jsonl entries at start.
2. Pick unclaimed work from PLAN.md.
3. Create a branch following BRANCHING.md.
4. Append events while working (\`jaxx log <lvl> "<msg>" --agent <name>\`).
5. Close sessions so VERIFICATION.md gets an automatic summary.
6. Push; sync via Git, never via shared folders.

## Human-agent split
Humans approve PRs and set direction in PLAN.md.
Agents implement, verify, log and report.
`,
};

export function ensureControlPlane(rootDir: string, projectName: string): string {
  const dir = agentDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(skillsDir(rootDir), { recursive: true });
  for (const file of CONTROL_PLANE_FILES) {
    const target = path.join(dir, file);
    if (!fs.existsSync(target)) {
      const tpl = TEMPLATES[file];
      fs.writeFileSync(target, tpl ? tpl(projectName) : "", "utf8");
    }
  }
  return dir;
}
