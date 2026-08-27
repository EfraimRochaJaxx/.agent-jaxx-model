import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readEventsFrom } from "@jaxx/core";

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
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-cli-proj-"));
  spawnSync("git", ["init", "-b", "main"], { cwd: proj, windowsHide: true });
});
afterAll(() => {
  fs.rmSync(proj, { recursive: true, force: true, maxRetries: 3 });
});

describe("jaxx init", () => {
  it("creates the full control plane", () => {
    const res = jaxx(["init", "Test Project"], proj);
    expect(res.code).toBe(0);
    for (const f of [
      "STATE.md",
      "PLAN.md",
      "PROGRESS.md",
      "DECISIONS.md",
      "VERIFICATION.md",
      "BRANCHING.md",
      "COLLABORATION.md",
      "AGENT_LOG.jsonl",
      "frame.config.ts",
    ]) {
      expect(fs.existsSync(path.join(proj, ".agent", f))).toBe(true);
    }
    const cfg = fs.readFileSync(path.join(proj, ".agent", "frame.config.ts"), "utf8");
    expect(cfg).toContain('"Test Project"');
    expect(fs.existsSync(path.join(proj, ".git", "hooks", "pre-commit"))).toBe(true);
    const hookContent = fs.readFileSync(path.join(proj, ".git", "hooks", "pre-commit"), "utf8");
    expect(hookContent).toContain("jaxx verify");
    expect(fs.existsSync(path.join(proj, ".git", "hooks", "post-commit"))).toBe(true);
    const postCommitContent = fs.readFileSync(path.join(proj, ".git", "hooks", "post-commit"), "utf8");
    expect(postCommitContent).toContain("COMMIT REVERTIDO");
    expect(fs.existsSync(path.join(proj, ".git", "hooks", "pre-push"))).toBe(true);
    const prePushContent = fs.readFileSync(path.join(proj, ".git", "hooks", "pre-push"), "utf8");
    expect(prePushContent).toContain("jaxx verify");
    expect(fs.existsSync(path.join(proj, ".github", "workflows", "jaxx-ci.yml"))).toBe(true);
    const ciContent = fs.readFileSync(path.join(proj, ".github", "workflows", "jaxx-ci.yml"), "utf8");
    expect(ciContent).toContain("npx jaxx verify");
    expect(fs.existsSync(path.join(proj, "AGENTS.md"))).toBe(true);
    const agentsContent = fs.readFileSync(path.join(proj, "AGENTS.md"), "utf8");
    expect(agentsContent).toContain("Protocolo de Operação do Agente — Test Project");
  });

  it("is idempotent (does not clobber existing files)", () => {
    const state = path.join(proj, ".agent", "STATE.md");
    fs.appendFileSync(state, "\nMARKER\n");
    const res = jaxx(["init", "Test Project"], proj);
    expect(res.code).toBe(0);
    expect(fs.readFileSync(state, "utf8")).toContain("MARKER");
  });

  it("rejects missing name with usage exit code", () => {
    const res = jaxx(["init"]);
    expect(res.code).toBe(2);
  });
});

describe("jaxx log", () => {
  it("appends validated events and returns 0", () => {
    const res = jaxx(["log", "GIT", "committed something", "--agent", "ci-bot"], proj);
    expect(res.code).toBe(0);
    const events = readEventsFrom(path.join(proj, ".agent", "AGENT_LOG.jsonl"));
    expect(events.events.at(-1)?.agent).toBe("ci-bot");
  });

  it("uses $JAXX_AGENT as fallback identity", () => {
    const r = spawnSync(process.execPath, [CLI, "log", "INFO", "via env"], {
      cwd: proj,
      encoding: "utf8",
      env: { ...process.env, JAXX_AGENT: "env-agent" },
    });
    expect(r.status).toBe(0);
    const events = readEventsFrom(path.join(proj, ".agent", "AGENT_LOG.jsonl"));
    expect(events.events.at(-1)?.agent).toBe("env-agent");
  });

  it("rejects invalid levels with exit code 2 and never touches the file", () => {
    const before = fs.readFileSync(path.join(proj, ".agent", "AGENT_LOG.jsonl"), "utf8");
    const res = jaxx(["log", "NOT_A_LEVEL", "x"], proj);
    expect(res.code).toBe(2);
    expect(fs.readFileSync(path.join(proj, ".agent", "AGENT_LOG.jsonl"), "utf8")).toBe(before);
  });

  it("logging from a subdirectory targets the project root, not the cwd", () => {
    const sub = path.join(proj, "src", "deep");
    fs.mkdirSync(sub, { recursive: true });
    const res = jaxx(["log", "INFO", "from nested dir", "--agent", "walker"], sub);
    expect(res.code).toBe(0);
    const events = readEventsFrom(path.join(proj, ".agent", "AGENT_LOG.jsonl"));
    expect(events.events.at(-1)?.msg).toBe("from nested dir");
    expect(fs.existsSync(path.join(sub, ".agent"))).toBe(false);
  });
});

describe("jaxx doctor", () => {
  it("passes on an initialized project (exit 0) and reports checks", () => {
    const res = jaxx(["doctor"], proj);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("Control plane");
    expect(res.stdout).toContain("Result: PASS");
  });

  it("fails deterministically when .agent/ is added to .gitignore", () => {
    const gitignore = path.join(proj, ".gitignore");
    fs.writeFileSync(gitignore, "node_modules/\n.agent/\n", "utf8");
    try {
      const res = jaxx(["doctor"], proj);
      expect(res.code).toBe(1);
      expect(res.stdout).toContain("Illegal rule detected: .agent/ must never be added to .gitignore");
    } finally {
      fs.unlinkSync(gitignore);
    }
  });

  it("fails deterministically when control plane is missing (exit 1)", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-cli-empty-"));
    try {
      const res = jaxx(["doctor"], empty);
      expect(res.code).toBe(1);
      expect(res.stdout).toContain("[xx]");
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it("supports --json machine output", () => {
    const res = jaxx(["doctor", "--json"], proj);
    expect(res.code).toBe(0);
    const report = JSON.parse(res.stdout);
    expect(report.ok).toBe(true);
    expect(Array.isArray(report.checks)).toBe(true);
  });
});

describe("jaxx skill", () => {
  it("add creates a valid skill; list shows it", () => {
    const add = jaxx(
      ["skill", "add", "my-skill", "--description", "Does things", "--trigger", "always", "--tools", "read,grep"],
      proj,
    );
    expect(add.code).toBe(0);
    const list = jaxx(["skill", "list", "--json"], proj);
    expect(list.code).toBe(0);
    const parsed = JSON.parse(list.stdout);
    expect(parsed.skills[0]).toMatchObject({ name: "my-skill", version: "0.1.0" });
  });

  it("refuses duplicate skill names", () => {
    const res = jaxx(["skill", "add", "my-skill"], proj);
    expect(res.code).not.toBe(0);
  });

  it("skill install refuses non-remote sources by default", () => {
    const res = jaxx(["skill", "install", "../../some/local/path"], proj);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/refusing non-https/);
  });
});
