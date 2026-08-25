import { spawnSync } from "node:child_process";

/**
 * Safe Git helpers. All invocations use execFile-style argument arrays
 * (no shell), fixed timeouts, and never interpolate user input into a
 * command string. See docs/security.md.
 */

export function isGitAvailable(): boolean {
  try {
    const r = spawnSync("git", ["--version"], { timeout: 5000, windowsHide: true });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}

/** Run git with args; returns trimmed stdout or null on any failure. */
export function runGit(cwd: string, args: string[], timeoutMs = 8000): string | null {
  try {
    const r = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: timeoutMs,
      windowsHide: true,
    });
    if (r.error || r.status !== 0) return null;
    return r.stdout.trim();
  } catch {
    return null;
  }
}

export interface CommitInfo {
  hash: string;
  subject: string;
  relTime: string;
  author: string;
}

export interface RepoStatus {
  path: string;
  isRepo: boolean;
  branch?: string;
  hash?: string;
  subject?: string;
  dirty?: boolean;
  recentCommits?: CommitInfo[];
  /** Names of local branches (for doctor's expected-branch checks). */
  branches?: string[];
}

export function getRepoStatus(dir: string): RepoStatus {
  const status: RepoStatus = { path: dir, isRepo: false };
  if (runGit(dir, ["rev-parse", "--is-inside-work-tree"]) !== "true") return status;
  status.isRepo = true;
  status.branch = runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? undefined;
  status.hash = runGit(dir, ["rev-parse", "--short", "HEAD"]) ?? undefined;
  status.subject = runGit(dir, ["log", "-1", "--format=%s"]) ?? undefined;
  status.dirty = (runGit(dir, ["status", "--porcelain"]) ?? "").length > 0;
  status.branches = (runGit(dir, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]) ?? "")
    .split("\n")
    .filter(Boolean);
  const logRaw =
    runGit(dir, ['log', '-15', '--format=%h%x1f%s%x1f%ar%x1f%an']) ?? "";
  status.recentCommits = logRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, relTime, author] = line.split("\x1f");
      return { hash, subject, relTime, author };
    });
  return status;
}
