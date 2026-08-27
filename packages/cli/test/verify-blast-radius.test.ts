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
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-blast-radius-test-"));
  spawnSync("git", ["init", "-b", "main"], { cwd: proj, windowsHide: true });
  spawnSync("git", ["config", "user.name", "Test Agent"], { cwd: proj, windowsHide: true });
  spawnSync("git", ["config", "user.email", "agent@test.com"], { cwd: proj, windowsHide: true });

  jaxx(["init", "Blast Radius Test Project"], proj);

  // In isolated temp test dirs, remove the hook so git commit doesn't fail on unlinked npx
  const hook = path.join(proj, ".git", "hooks", "pre-commit");
  if (fs.existsSync(hook)) fs.unlinkSync(hook);

  // Initial baseline commit
  spawnSync("git", ["add", "-A"], { cwd: proj, windowsHide: true });
  spawnSync("git", ["commit", "-m", "initial commit"], { cwd: proj, windowsHide: true });
});

afterAll(() => {
  fs.rmSync(proj, { recursive: true, force: true, maxRetries: 3 });
});

describe("AST Dependency & Blast Radius Impact Gate", () => {
  it("passes verify when no files are staged", () => {
    const res = jaxx(["verify"], proj);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Pre-commit verification passed");
  });

  it("reports blast radius when source files and audit are staged", () => {
    // Create source file and a test file
    const srcDir = path.join(proj, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "math.ts"), "export function add(a: number, b: number) { return a + b; }", "utf8");
    fs.writeFileSync(path.join(srcDir, "math.test.ts"), "import { add } from './math';\nadd(1, 2);", "utf8");

    // Add log
    jaxx(["log", "INFO", "Added math module and tests"], proj);

    // Stage source, test and log
    spawnSync("git", ["add", "src/math.ts", "src/math.test.ts", ".agent/AGENT_LOG.jsonl"], { cwd: proj, windowsHide: true });

    const res = jaxx(["verify"], proj);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Blast radius impact gate");
    expect(res.stdout).toContain("Pre-commit verification passed");
  });
});
