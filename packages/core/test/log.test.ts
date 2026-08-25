import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendEvent, readEventsFrom, checkLogIntegrity, logEvent } from "../src/log";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-log-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function logPath(): string {
  return path.join(tmp, ".agent", "AGENT_LOG.jsonl");
}

describe("append-only audit log", () => {
  it("appends and reads events round-trip", () => {
    logEvent(tmp, "INFO", "first", "agent-a");
    logEvent(tmp, "DONE", "second", "agent-b");
    const res = readEventsFrom(logPath());
    expect(res.events).toHaveLength(2);
    expect(res.events[0].msg).toBe("first");
    expect(res.events[1].lvl).toBe("DONE");
    expect(res.malformedLines).toHaveLength(0);
  });

  it("tolerates malformed lines without destroying data", () => {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    const good = JSON.stringify({
      ts: new Date().toISOString(),
      lvl: "INFO",
      agent: "x",
      msg: "good line before corruption",
    });
    fs.writeFileSync(logPath(), `${good}\nNOT JSON AT ALL {{{\n${good.replace("before", "after")}\n`);
    const res = readEventsFrom(logPath());
    expect(res.events).toHaveLength(2);
    expect(res.malformedLines).toEqual([1]);
    const integrity = checkLogIntegrity(tmp);
    expect(integrity.valid).toBe(2);
    expect(integrity.malformed).toBe(1);
    // File untouched:
    expect(fs.readFileSync(logPath(), "utf8")).toContain("NOT JSON AT ALL");
  });

  it("handles concurrent writers without lost updates", async () => {
    const writers = Array.from({ length: 8 }, (_, i) =>
      Promise.resolve().then(() => {
        for (let j = 0; j < 25; j++) {
          logEvent(tmp, "INFO", `w${i}-m${j}`, `agent-${i}`);
        }
      }),
    );
    await Promise.all(writers);
    const res = readEventsFrom(logPath());
    expect(res.events).toHaveLength(8 * 25);
    expect(res.malformedLines).toHaveLength(0);
  });

  it("never rewrites existing content on append failure paths", () => {
    logEvent(tmp, "INFO", "keep me", "a");
    const before = fs.readFileSync(logPath(), "utf8");
    expect(() =>
      logEvent(tmp, "BOGUS" as never, "invalid level should fail validation", "a"),
    ).toThrow();
    expect(fs.readFileSync(logPath(), "utf8")).toBe(before);
  });

  it("reports timestamp regression as soft violation", () => {
    const old = "2020-01-01T00:00:00.000Z";
    const now = new Date().toISOString();
    appendEvent(tmp, { ts: now, lvl: "INFO", agent: "a", msg: "newer first" });
    appendEvent(tmp, { ts: old, lvl: "INFO", agent: "a", msg: "much older after" });
    const integrity = checkLogIntegrity(tmp);
    expect(integrity.appendOnlyViolation).toMatch(/timestamp regression/);
  });
});
