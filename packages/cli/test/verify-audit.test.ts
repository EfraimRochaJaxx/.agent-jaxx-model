import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/index.js");

function jaxx(args: string[], cwd?: string) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

let proj: string;

beforeAll(() => {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-audit-gate-test-"));
  spawnSync("git", ["init", "-b", "main"], { cwd: proj, windowsHide: true });
  spawnSync("git", ["config", "user.name", "Test Agent"], { cwd: proj, windowsHide: true });
  spawnSync("git", ["config", "user.email", "agent@test.com"], { cwd: proj, windowsHide: true });

  // 1. Initial git repository commit before hooks
  fs.writeFileSync(path.join(proj, "README.md"), "# Test", "utf8");
  spawnSync("git", ["add", "-A"], { cwd: proj, windowsHide: true });
  spawnSync("git", ["commit", "-m", "initial repo"], { cwd: proj, windowsHide: true });

  // 2. Initialize JAXX control plane (which generates audit log in .agent/)
  jaxx(["init", "Audit Test Project"], proj);

  // 3. Legitimate commit of control plane
  spawnSync("git", ["add", "-A"], { cwd: proj, windowsHide: true });
  spawnSync("git", ["commit", "-m", "chore: init jaxx control plane"], { cwd: proj, windowsHide: true });
});

afterAll(() => {
  fs.rmSync(proj, { recursive: true, force: true, maxRetries: 3 });
});

describe("Deterministic Audit Trail Gate", () => {
  it("passes verify when no files are staged", () => {
    const res = jaxx(["verify"], proj);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Pre-commit verification passed");
  });

  it("blocks verify when code is staged without an audit entry in .agent/", () => {
    // Create and stage a code file
    const srcDir = path.join(proj, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "app.ts"), "export const a = 1;", "utf8");
    spawnSync("git", ["add", "src/app.ts"], { cwd: proj, windowsHide: true });

    const res = jaxx(["verify"], proj);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Audit trail gate");
    expect(res.stderr).toContain("without an audit log or session verification");
  });

  it("passes verify once jaxx log is run and .agent/ is staged", () => {
    // Run jaxx log to add audit entry
    const logRes = jaxx(["log", "INFO", "Added app module"], proj);
    expect(logRes.code).toBe(0);

    // Stage the updated audit log
    spawnSync("git", ["add", ".agent/AGENT_LOG.jsonl"], { cwd: proj, windowsHide: true });

    const res = jaxx(["verify"], proj);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Pre-commit verification passed");
  });

  it("passes verify when only .agent/ files are staged", () => {
    // Commit the previous compliant stage
    spawnSync("git", ["commit", "-m", "feat: add app"], { cwd: proj, windowsHide: true });

    // Modify and stage only a docs/state file
    fs.appendFileSync(path.join(proj, ".agent", "STATE.md"), "\n## Note\n");
    spawnSync("git", ["add", ".agent/STATE.md"], { cwd: proj, windowsHide: true });

    const res = jaxx(["verify"], proj);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Pre-commit verification passed");
  });
});
