import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Session } from "../src/session";
import { readEventsFrom } from "../src/log";
import { ensureControlPlane } from "../src/controlplane";
import { loadFrameConfigFromPath, findProjectRoot } from "../src/config";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-session-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function logPath(): string {
  return path.join(tmp, ".agent", "AGENT_LOG.jsonl");
}

describe("session lifecycle", () => {
  it("open -> events -> close writes summary to VERIFICATION.md", () => {
    ensureControlPlane(tmp, "Demo");
    const session = new Session(tmp, "test-agent");
    session.open();
    session.record("INFO", "did something");
    session.record("GIT", "committed abc123");
    const summary = session.close();
    expect(summary.events).toHaveLength(2);
    expect(summary.counts["INFO"]).toBe(1);
    expect(summary.counts["GIT"]).toBe(1);

    const verification = session.writeVerification(summary);
    const content = fs.readFileSync(verification, "utf8");
    expect(content).toContain(`## Session ${summary.sessionId}`);
    expect(content).toContain("test-agent");
    expect(content).toContain("did something");

    // open/close events are also in the log (4 total incl. open+close)
    const res = readEventsFrom(logPath());
    expect(res.events.length).toBe(4);
    expect(res.events[res.events.length - 1].lvl).toBe("DONE");
  });
});

describe("control plane bootstrap", () => {
  it("creates all required files idempotently", () => {
    ensureControlPlane(tmp, "Demo");
    ensureControlPlane(tmp, "Demo"); // second call must not clobber
    for (const f of [
      "STATE.md",
      "PLAN.md",
      "PROGRESS.md",
      "DECISIONS.md",
      "VERIFICATION.md",
      "BRANCHING.md",
      "COLLABORATION.md",
      "AGENT_LOG.jsonl",
      "skills",
    ]) {
      expect(fs.existsSync(path.join(tmp, ".agent", f))).toBe(true);
    }
  });
});

describe("frame config loading", () => {
  it("loads and validates a frame.config.ts", () => {
    ensureControlPlane(tmp, "Demo");
    fs.writeFileSync(
      path.join(tmp, ".agent", "frame.config.ts"),
      `export default {
        project: { name: "My Project" },
        theme: { primaryColor: "#00ff00" },
        repos: [{ name: "app", path: "./app" }],
        docker: { containers: ["db"] },
        ports: { dashboard: 3099 },
      };`,
      "utf8",
    );
    const cfg = loadFrameConfigFromPath(path.join(tmp, ".agent", "frame.config.ts"));
    expect(cfg.project.name).toBe("My Project");
    expect(cfg.theme.primaryColor).toBe("#00ff00");
    expect(cfg.repos[0].defaultBranch).toBe("main");
  });

  it("rejects invalid configs with readable errors", () => {
    ensureControlPlane(tmp, "Demo");
    const p = path.join(tmp, ".agent", "frame.config.ts");
    fs.writeFileSync(p, `export default { project: {} };`, "utf8");
    expect(() => loadFrameConfigFromPath(p)).toThrow(/Invalid frame config/);
  });

  it("findProjectRoot walks up directories", () => {
    ensureControlPlane(tmp, "Demo");
    fs.writeFileSync(
      path.join(tmp, "frame.config.ts"),
      `export default { project: { name: "Root" } };`,
      "utf8",
    );
    const nested = path.join(tmp, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    expect(findProjectRoot(nested)).toBe(path.resolve(tmp));
  });
});
