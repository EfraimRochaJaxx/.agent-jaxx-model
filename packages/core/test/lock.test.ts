import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquireLock, releaseLock, LockTimeoutError } from "../src/lock";

describe("file lock", () => {
  it("acquires and releases", () => {
    const lock = path.join(os.tmpdir(), `jaxx-lock-test-${process.pid}.lock`);
    acquireLock(lock, { timeoutMs: 1000 });
    releaseLock(lock);
    // Re-acquirable after release.
    expect(() => acquireLock(lock, { timeoutMs: 500 })).not.toThrow();
    releaseLock(lock);
  });

  it("times out when held by another writer", () => {
    const lock = path.join(os.tmpdir(), `jaxx-lock-test-held-${process.pid}.lock`);
    acquireLock(lock, { timeoutMs: 60_000 });
    try {
      expect(() => acquireLock(lock, { timeoutMs: 200 })).toThrow(LockTimeoutError);
    } finally {
      releaseLock(lock);
    }
  });

  it("breaks stale locks", async () => {
    const lock = path.join(os.tmpdir(), `jaxx-lock-test-stale-${process.pid}.lock`);
    fs.writeFileSync(lock, JSON.stringify({ pid: -1, ts: "old" }));
    const old = Date.now() - 60_000;
    fs.utimesSync(lock, new Date(old), new Date(old));
    expect(() => acquireLock(lock, { timeoutMs: 2000, staleMs: 100 })).not.toThrow();
    releaseLock(lock);
  });
});
