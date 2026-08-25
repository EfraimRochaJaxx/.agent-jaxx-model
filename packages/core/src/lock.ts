import fs from "node:fs";
import path from "node:path";

/**
 * Simple cross-platform advisory file lock for concurrent writers.
 * Uses exclusive-create lockfiles with stale-lock detection.
 * Lock files live next to the guarded file: `<file>.lock`.
 */

export interface FileLockOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
  /** Locks older than this are considered stale and broken. */
  staleMs?: number;
}

const DEFAULTS: Required<FileLockOptions> = {
  timeoutMs: 10_000,
  retryDelayMs: 50,
  staleMs: 30_000,
};

export class LockTimeoutError extends Error {
  constructor(public readonly lockPath: string, timeoutMs: number) {
    super(`Timed out acquiring lock after ${timeoutMs}ms: ${lockPath}`);
    this.name = "LockTimeoutError";
  }
}

function isStale(lockPath: string, staleMs: number): boolean {
  try {
    const st = fs.statSync(lockPath);
    return Date.now() - st.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

export function acquireLock(lockPath: string, opts: FileLockOptions = {}): void {
  const { timeoutMs, retryDelayMs, staleMs } = { ...DEFAULTS, ...opts };
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const start = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, ts: new Date().toISOString() }));
      fs.closeSync(fd);
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;
      if (isStale(lockPath, staleMs)) {
        // Stale lock left by a crashed writer — break it. Best effort race:
        // rename first so only one breaker wins.
        try {
          fs.renameSync(lockPath, `${lockPath}.stale-${process.pid}-${Date.now()}`);
        } catch {
          /* someone else broke or re-acquired it */
        }
        continue;
      }
      if (Date.now() - start > timeoutMs) throw new LockTimeoutError(lockPath, timeoutMs);
      const wait = Math.floor(retryDelayMs * (0.5 + Math.random()));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
}

export function releaseLock(lockPath: string): void {
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    /* best effort */
  }
}

/** Run `fn` while holding the lock. Always releases, even on error. */
export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T> | T,
  opts: FileLockOptions = {},
): Promise<T> {
  acquireLock(lockPath, opts);
  try {
    return await fn();
  } finally {
    releaseLock(lockPath);
  }
}
