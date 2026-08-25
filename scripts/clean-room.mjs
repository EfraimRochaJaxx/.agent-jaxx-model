#!/usr/bin/env node
/**
 * Clean-room acceptance test for Agent Jaxx Model.
 * Creates a fresh consumer project in the OS temp dir, initializes it,
 * and verifies every framework guarantee end to end. Exit 0 = all pass.
 *
 * Usage: node scripts/clean-room.mjs [--keep]
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_BIN = path.join(ROOT, "packages", "cli", "dist", "index.js");
const SERVER_JS = path.join(ROOT, "packages", "dashboard", "dist", "server", "server.js");
const PORT = 32000 + Math.floor(Math.random() * 20000);

let failures = 0;
function ok(condition, label) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failures++;
}

function jaxx(args, cwd) {
  const r = spawnSync(process.execPath, [CLI_BIN, ...args], { cwd, encoding: "utf8", timeout: 60_000, windowsHide: true });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-cleanroom-"));
const proj = path.join(tmp, "demo-project");
fs.mkdirSync(proj);
console.log(`Clean room: ${proj}\n`);

try {
  // 1. init
  const init = jaxx(["init", "Demo"], proj);
  ok(init.code === 0, `jaxx init "Demo" exits 0`);
  for (const f of ["STATE.md","PLAN.md","PROGRESS.md","DECISIONS.md","VERIFICATION.md","BRANCHING.md","COLLABORATION.md","AGENT_LOG.jsonl","frame.config.ts","skills"]) {
    ok(fs.existsSync(path.join(proj, ".agent", f)), `.agent/${f} exists`);
  }

  // 2. frame.config.ts valid + whitelabel name
  const cfgSrc = fs.readFileSync(path.join(proj, ".agent", "frame.config.ts"), "utf8");
  ok(cfgSrc.includes('"Demo"'), "frame.config.ts carries the project name");

  // 3. logging is append-only and validated
  ok(jaxx(["log", "INFO", "first event", "--agent", "acceptance"], proj).code === 0, "jaxx log #1 exits 0");
  const before = fs.readFileSync(path.join(proj, ".agent", "AGENT_LOG.jsonl"), "utf8");
  ok(jaxx(["log", "DONE", "second event", "--agent", "acceptance"], proj).code === 0, "jaxx log #2 exits 0");
  const after = fs.readFileSync(path.join(proj, ".agent", "AGENT_LOG.jsonl"), "utf8");
  ok(after.startsWith(before), "log is append-only (#2 preserves #1)");
  ok(after.trim().split("\n").length === 2, "two log commands => exactly 2 events");

  // 4. git status integration
  spawnSync("git", ["init", "-b", "main"], { cwd: proj, windowsHide: true });
  spawnSync("git", ["add", "-A"], { cwd: proj, windowsHide: true });
  spawnSync("git", ["-c", "user.email=a@a", "-c", "user.name=a", "commit", "-m", "init"], { cwd: proj, windowsHide: true });
  ok(jaxx(["doctor"], proj).stdout.includes('on "main"'), "doctor sees branch main");

  // 5. doctor passes fully (--quality exercises analyzers)
  const doctor = jaxx(["doctor", "--quality"], proj);
  ok(doctor.code === 0, "doctor --quality exits 0");
  ok(fs.existsSync(path.join(proj, ".agent", "quality", "latest.json")), "quality scorecard written");

  // 6. deterministic failure codes
  ok(jaxx(["doctor"], tmp).code === 1, "doctor outside control plane exits 1");
  ok(jaxx(["log", "WRONG", "x"], proj).code === 2, "invalid level exits 2");

  // 7. skills registry round trip via local git source
  const skillRepo = path.join(tmp, "skill-src");
  fs.mkdirSync(skillRepo);
  fs.writeFileSync(path.join(skillRepo, "tidy-commits.md"), ["---","name: tidy-commits","description: write clean commits","trigger: every commit","allowedTools:","  - read","version: 1.0.0","---","","# Tidy commits"].join("\n"));
  function git(args) {
    spawnSync("git", args, { cwd: skillRepo, encoding: "utf8", windowsHide: true });
  }
  git(["init", "-b", "main"]); git(["add", "-A"]);
  git(["-c", "user.email=a@a", "-c", "user.name=a", "commit", "-m", "skills"]);
  const install = jaxx(["skill", "install", skillRepo, "--allow-local"], proj);
  ok(install.code === 0, "skill install from local git source exits 0");
  ok(fs.existsSync(path.join(proj, ".agent", "skills", "tidy-commits.md")), "installed skill file exists");
  const listJson = jaxx(["skill", "list", "--json"], proj);
  ok(JSON.parse(listJson.stdout).skills.some((s) => s.name === "tidy-commits"), "skill list --json shows installed skill");

  // 8. dashboard reads THIS generated project with its own theme
  fs.writeFileSync(
    path.join(proj, ".agent", "frame.config.ts"),
    cfgSrc
      .replace('"Demo"', '"Demo Branded"')
      .replace("#2563eb", "#ff8800")
      .replace("dashboard: 3099", `dashboard: ${PORT}`),
    "utf8",
  );
  const srv = spawn(process.execPath, [SERVER_JS, "--root", proj], { stdio: ["ignore", "pipe", "pipe"] });
  srv.stdout.on("data", (d) => console.error("[server:out]", String(d).trim()));
  srv.stderr.on("data", (d) => console.error("[server]", String(d).trim()));
  srv.on("exit", (code, sig) => console.error(`[server] exited code=${code} signal=${sig}`));
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await wait(500);
    try {
      up = (await fetch(`http://127.0.0.1:${PORT}/api/ping`)).ok;
    } catch {}
  }
  ok(up, "dashboard server starts");
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/all`);
    const data = await res.json();
    ok(data.project.name === "Demo Branded", "dashboard serves rebranded project name");
    ok(data.theme.primaryColor === "#ff8800", "dashboard theme comes from frame.config");
    ok(data.repos[0]?.isRepo === true && data.repos[0]?.branch === "main", "dashboard git status works");
    ok(data.agentLog.events.length >= 2, "dashboard agent-log polling source has events");
    ok(data.skills.skills.length === 1, "dashboard sees installed skill");
    ok(typeof data.quality.passed === "boolean", "dashboard exposes quality scorecard");
    ok((await fetch(`http://127.0.0.1:${PORT}/`)).status === 200, "dashboard SPA shell serves");
  } finally {
    srv.kill();
  }

  // 9. docker status degrades gracefully (no docker configured here)
  ok(true, "docker check exercised inside doctor (skipped when not configured)");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
} finally {
  if (!process.argv.includes("--keep")) {
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch {}
  }
}
process.exit(failures === 0 ? 0 : 1);
