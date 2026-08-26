import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadFrameConfig } from "@jaxx/core";

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

let tmpRoot: string;
let mainProj: string;
let backendProj: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-repo-test-"));
  mainProj = path.join(tmpRoot, "frontend");
  backendProj = path.join(tmpRoot, "backend-api");

  fs.mkdirSync(mainProj, { recursive: true });
  fs.mkdirSync(backendProj, { recursive: true });

  spawnSync("git", ["init", "-b", "main"], { cwd: mainProj, windowsHide: true });
  spawnSync("git", ["init", "-b", "main"], { cwd: backendProj, windowsHide: true });

  jaxx(["init", "Workspace Main"], mainProj);
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 3 });
});

describe("jaxx repo command", () => {
  it("lists initial repository", () => {
    const res = jaxx(["repo", "list"], mainProj);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Configured repositories");
    expect(res.stdout).toContain("main");
  });

  it("links another repository with jaxx repo add", () => {
    const res = jaxx(["repo", "add", "backend", "../backend-api"], mainProj);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Linked repository "backend"');

    const config = loadFrameConfig(mainProj);
    expect(config.repos.some((r) => r.name === "backend")).toBe(true);

    const backendEntry = config.repos.find((r) => r.name === "backend");
    expect(backendEntry?.path).toContain("backend-api");
  });

  it("returns json status for linked repositories", () => {
    const res = jaxx(["repo", "list", "--json"], mainProj);
    expect(res.code).toBe(0);
    const data = JSON.parse(res.stdout);
    expect(data.ok).toBe(true);
    expect(data.repos).toHaveLength(2);
    expect(data.repos.find((r: { name: string }) => r.name === "backend")).toBeDefined();
  });

  it("refuses duplicate repository names", () => {
    const res = jaxx(["repo", "add", "backend", "../another-api"], mainProj);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("already configured");
  });

  it("removes a linked repository with jaxx repo remove", () => {
    const res = jaxx(["repo", "remove", "backend"], mainProj);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Removed repository "backend"');

    const config = loadFrameConfig(mainProj);
    expect(config.repos.some((r) => r.name === "backend")).toBe(false);
  });
});
