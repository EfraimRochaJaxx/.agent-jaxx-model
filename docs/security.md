# Security Model

Agent Jaxx Model is infrastructure for autonomous agents. Its security posture
assumes that **agents and external content can be hostile**, while the local
project repository is the trust root.

## Trust boundaries

| Zone | Trust level | Examples |
| ---- | ----------- | -------- |
| Project repository | Trusted (it is the consumer's own code) | `.agent/`, `frame.config.ts`, source files |
| Framework code | Trusted | `packages/*` |
| External skill repositories | **Untrusted input** | anything passed to `jaxx skill install` |
| Dashboard HTTP clients | Local-only; read-only API | browser on 127.0.0.1 |
| Environment / CI | Depends on deployment | secrets must never enter the log |

## Skills are untrusted data

`jaxx skill install` treats every file from an external repository as inert:

- Only HTTPS and SSH git URLs are accepted. Local paths and `file://` require
  an explicit `--allow-local` (intended for local development/testing).
- Cloning happens with fixed argument arrays — no shell interpolation.
- Candidate files: only regular `*.md` files at repo root or under `skills/`,
  max depth 3. Symlinks are refused outright (lstat check).
- Frontmatter is validated against a strict Zod schema (`name` regex rejects
  `/`, `\`, `..`; semver version required). A minimal declarative YAML subset
  parser is used — no YAML features that can execute or alias objects.
- Installation copies the validated Markdown **verbatim as data** via
  read/write into `.agent/skills/<name>.md`. Destinations are re-checked to
  stay inside the skills directory.
- Nothing from the source repository is executed, required, imported or
  interpreted as configuration — including `allowedTools`, which is metadata
  for humans/agents to reason about, not an instruction the framework acts on.

## Append-only audit log

- Writes are schema-validated then appended under an advisory file lock;
  concurrent writers cannot interleave partial lines.
- Reads are tolerant: malformed lines are skipped and *reported*, never
  rewritten or deleted. Historical evidence is preserved even when corrupted.
- Integrity checks in `jaxx doctor` surface malformed-line counts and
  timestamp regressions without mutating the file.

## Git safety

- All git invocations use argument arrays (`spawnSync("git", args)`), fixed
  timeouts, no shell. User-controlled strings are passed as arguments, never
  interpolated into command strings.
- The framework never force-pushes, resets destructively, or rewrites history.

## Dashboard

- Binds to 127.0.0.1 only; GET/HEAD only.
- Static serving is jailed to the built web directory; path traversal returns 403.
- Logo serving resolves only inside the project root and refuses symlinks/non-files.
- The API is read-only; it exposes control-plane state but accepts no mutations.

## frame.config.ts execution

The frame config is transpiled and loaded like any local project module — it
has the same trust level as the repository itself. It is **never** loaded from
external sources (skills, remote URLs).

## Known limitations

- The advisory lock is per-machine (not network-safe); cross-machine
  concurrency relies on the documented `git pull --rebase` workflow.
- Dead-code and duplication analyzers are approximate by design and advisory.
- Branch-protection probing requires `gh` and network access, and is opt-in.
