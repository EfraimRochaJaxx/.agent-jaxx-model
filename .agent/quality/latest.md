# Quality Scorecard

- Generated: 2026-08-27T01:36:03.552Z
- Files analyzed: 35 · Functions: 219
- Thresholds: complexity ≤ 10, duplication ≤ 5%
- Result: **PASS**

## Top functions by complexity

- `parseSimpleYaml` in packages/core/src/skills.ts — 10
- `logoResponse` in packages/dashboard/server/server.ts — 10
- `serveStatic` in packages/dashboard/server/server.ts — 10
- `App` in packages/dashboard/src/App.tsx — 10
- `main` in packages/cli/src/index.ts — 9

## Duplication

- Ratio: 3.6% of 4281 significant lines
- block `05ab8df3d768` ×3 (first: packages/core/src/git.ts:19)
- block `108cd8ce7bf8` ×3 (first: packages/cli/src/commands/bridge.ts:61)
- block `a741382de55f` ×3 (first: packages/cli/src/commands/bridge.ts:62)
- block `2487b01e81c4` ×3 (first: packages/cli/src/commands/bridge.ts:63)
- block `bf003ac24104` ×2 (first: frame.config.example.ts:6)

## Dead code candidates (approximate)

- `ComplexityReport` in packages/analyzers/src/complexity.ts
- `DeadCodeReport` in packages/analyzers/src/deadcode.ts
- `DuplicationBlock` in packages/analyzers/src/duplication.ts
- `loadFrameConfigFromPath` in packages/core/src/config.ts
- `CommitInfo` in packages/core/src/git.ts
- `RepoStatus` in packages/core/src/git.ts
- `withFileLock` in packages/core/src/lock.ts
- `FileLockOptions` in packages/core/src/lock.ts
- `LockTimeoutError` in packages/core/src/lock.ts
- `agentLogPath` in packages/core/src/log.ts
- `AppendResult` in packages/core/src/log.ts
- `ReadEventsResult` in packages/core/src/log.ts
- `LogIntegrity` in packages/core/src/log.ts
- `SKILLS_DIR_NAME` in packages/core/src/paths.ts
- `FRAME_CONFIG_FILENAME` in packages/core/src/paths.ts

_Note: approximate — exported symbols never referenced by another analyzed file (106 exports scanned); entry points exempt_
