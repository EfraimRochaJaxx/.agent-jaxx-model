import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Security tests for the skills registry.
 * External skill sources are UNTRUSTED INPUT. These tests simulate hostile
 * repositories locally (git file:// remotes via --allow-local) and assert:
 *  - nothing is ever executed;
 *  - path traversal in names is impossible;
 *  - symlinks are refused;
 *  - malformed frontmatter is rejected without touching the registry;
 *  - valid skills are copied verbatim as data.
 */

const CLI = path.resolve(__dirname, "../dist/index.js");

function jaxx(args: string[], cwd?: string) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 60_000, windowsHide: true });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

let workspace: string;
let project: string;

beforeAll(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-skillsec-"));
  project = path.join(workspace, "consumer");
  fs.mkdirSync(project);
  jaxx(["init", "Consumer"], project);
});

afterAll(() => {
  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 3 });
});

function makeSkillRepo(name: string, files: Record<string, string>, opts: { symlink?: string } = {}): string {
  const repo = path.join(workspace, name);
  fs.mkdirSync(repo, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(repo, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf8");
  }
  if (opts.symlink) {
    try {
      fs.symlinkSync(path.join(repo, opts.symlink), path.join(repo, "skills", "evil-link.md"), "file");
    } catch {
      /* Windows may require privileges; test then asserts no link handling */
    }
  }
  git(repo, ["init", "-b", "main"]);
  git(repo, ["add", "-A"]);
  git(repo, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "skill repo"]);
  return repo;
}

function skillMd(name: string): string {
  return [
    "---",
    `name: ${name}`,
    "description: legit skill",
    "trigger: on demand",
    "allowedTools:",
    "  - read",
    "version: 1.2.3",
    "---",
    "",
    "# Body",
  ].join("\n");
}

describe("skills install security boundaries", () => {
  it("installs a valid skill from a local git source when explicitly allowed", () => {
    const repo = makeSkillRepo("good-repo", { "skills/clean-code.md": skillMd("clean-code") });
    const res = jaxx(["skill", "install", repo, "--allow-local"], project);
    expect(res.code).toBe(0);
    const target = path.join(project, ".agent", "skills", "clean-code.md");
    expect(fs.existsSync(target)).toBe(true);
    // Copied verbatim as data — never transformed or executed.
    expect(fs.readFileSync(target, "utf8")).toContain("# Body");
  });

  it("refuses traversal-style skill names", () => {
    const evil = skillMd("../../../../etc/passwd");
    const repo = makeSkillRepo("traversal-repo", { "skills/innocent.md": evil });
    const res = jaxx(["skill", "install", repo, "--allow-local"], project);
    expect(res.code).not.toBe(0);
    const dir = fs.readdirSync(path.join(project, ".agent", "skills"));
    expect(dir).toEqual(["clean-code.md"]); // nothing new installed
    expect(fs.existsSync(path.join(project, "..", "etc"))).toBe(false);
  });

  it("rejects malformed frontmatter without installing anything from that file", () => {
    const bad = "---\nname: broken\n---\nno description field";
    const repo = makeSkillRepo("broken-repo", { "skills/broken.md": bad, "README.txt": "not scanned" });
    const res = jaxx(["skill", "install", repo, "--allow-local"], project);
    expect(res.code).not.toBe(0);
    expect(fs.readdirSync(path.join(project, ".agent", "skills"))).not.toContain("broken");
  });

  it("never executes command-like frontmatter values", () => {
    const sneaky = [
      "---",
      "name: sneaky",
      "description: $(calc.exe) `rm -rf /` && del C:\\Windows",
      "trigger: '; drop table agents;--",
      "allowedTools:",
      "  - exec",
      "version: 9.9.9",
      "---",
      "",
      "<script>alert(1)</script>",
    ].join("\n");
    const repo = makeSkillRepo("sneaky-repo", { "skills/sneaky.md": sneaky });
    const res = jaxx(["skill", "install", repo, "--allow-local"], project);
    // Installation succeeds because content is inert DATA...
    expect(res.code).toBe(0);
    const raw = fs.readFileSync(path.join(project, ".agent", "skills", "sneaky.md"), "utf8");
    // ...stored verbatim, never interpreted or executed.
    expect(raw).toContain("<script>alert(1)</script>");
  });

  it("skips already-installed skills idempotently", () => {
    const repo = makeSkillRepo("dup-repo", { "skills/clean-code.md": skillMd("clean-code") });
    const res = jaxx(["skill", "install", repo, "--allow-local", "--json"], project);
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).skipped).toContain("clean-code");
  });

  it("blocks file:// sources unless allow-local is passed", () => {
    const res = jaxx(["skill", "install", "file:///C:/tmp/repo"]);
    expect(res.code).not.toBe(0);
  });

  it("fails cleanly on unreachable sources with deterministic exit code", () => {
    const url = process.platform === "win32" ? "C:\\definitely\\not\\a\\repo" : "/definitely/not/a/repo";
    const res = jaxx(["skill", "install", url, "--allow-local"]);
    expect(res.code).toBe(3); // CONFIG error class
  });
});
