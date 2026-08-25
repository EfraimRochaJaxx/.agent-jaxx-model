import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SERVER = path.resolve(__dirname, "../dist/server/server.js");
const PORT = 35000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;

let proj: string;
let child: ReturnType<typeof spawn> | null = null;

beforeAll(async () => {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-dash-"));
  const agentDir = path.join(proj, ".agent");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, "frame.config.ts"),
    `export default {
      project: { name: "Dash Test", logoPath: "../../outside.svg" },
      repos: [],
      docker: { containers: [] },
      ports: { dashboard: ${PORT} },
    };`,
    "utf8",
  );
  fs.appendFileSync(
    path.join(agentDir, "AGENT_LOG.jsonl"),
    JSON.stringify({ ts: new Date().toISOString(), lvl: "INFO", agent: "t", msg: "dash test event" }) + "\n",
  );
  child = spawn(process.execPath, [SERVER, "--root", proj], { windowsHide: true });
  await waitForServer();
}, 30_000);

function waitForServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const r = await fetch(`${BASE}/api/ping`);
        if (r.ok) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > 15_000) return reject(new Error("server did not start"));
      setTimeout(tick, 300);
    };
    tick();
  });
}

afterAll(() => {
  child?.kill();
  fs.rmSync(proj, { recursive: true, force: true, maxRetries: 3 });
});

describe("dashboard server", () => {
  it("/api/all returns whitelabel config and control-plane data", async () => {
    const res = await fetch(`${BASE}/api/all`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.project.name).toBe("Dash Test");
    expect(data.agentLog.events).toHaveLength(1);
    expect(data.agentLog.events[0].msg).toBe("dash test event");
    expect(Array.isArray(data.repos)).toBe(true);
  });

  it("refuses logo paths that escape the project root", async () => {
    // frame.config declares logoPath "../../outside.svg" -> must not resolve
    const outside = path.resolve(proj, "..", "..", "outside.svg");
    fs.writeFileSync(outside, "<svg/>", "utf8");
    try {
      const res = await fetch(`${BASE}/api/logo`);
      expect(res.status).toBe(404);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it("serves the built SPA shell", async () => {
    // web build may or may not exist in CI order; endpoint must respond 200/404 JSON, never crash
    const res = await fetch(BASE);
    expect([200, 404]).toContain(res.status);
  });
});
