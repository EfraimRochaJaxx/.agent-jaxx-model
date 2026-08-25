# Quality Scorecard

- Generated: 2026-08-25T16:25:56.918Z
- Files analyzed: 28 · Functions: 141
- Thresholds: complexity ≤ 10, duplication ≤ 5%
- Result: **PASS**

## Top functions by complexity

- `parseSimpleYaml` in packages/core/src/skills.ts — 10
- `logoResponse` in packages/dashboard/server/server.ts — 10
- `App` in packages/dashboard/src/App.tsx — 10
- `main` in packages/cli/src/index.ts — 9
- `serveStatic` in packages/dashboard/server/server.ts — 9

## Duplication

- Ratio: 4.1% of 2560 significant lines
- block `05ab8df3d768` ×3 (first: packages/core/src/git.ts:19)
- block `bf003ac24104` ×2 (first: frame.config.example.ts:6)
- block `7d02f9e3291f` ×2 (first: frame.config.example.ts:7)
- block `3a80f842e47b` ×2 (first: frame.config.example.ts:8)
- block `4cc4251f9b23` ×2 (first: frame.config.example.ts:14)

## Dead code candidates (approximate)

- `ComplexityReport` in packages/analyzers/src/complexity.ts
- `DeadCodeReport` in packages/analyzers/src/deadcode.ts
- `DuplicationBlock` in packages/analyzers/src/duplication.ts
- `locateFrameConfig` in packages/core/src/config.ts
- `loadFrameConfigFromPath` in packages/core/src/config.ts
- `runGit` in packages/core/src/git.ts
- `CommitInfo` in packages/core/src/git.ts
- `RepoStatus` in packages/core/src/git.ts
- `withFileLock` in packages/core/src/lock.ts
- `FileLockOptions` in packages/core/src/lock.ts
- `LockTimeoutError` in packages/core/src/lock.ts
- `agentLogPath` in packages/core/src/log.ts
- `AppendResult` in packages/core/src/log.ts
- `ReadEventsResult` in packages/core/src/log.ts
- `LogIntegrity` in packages/core/src/log.ts

_Note: approximate — exported symbols never referenced by another analyzed file (86 exports scanned); entry points exempt_
