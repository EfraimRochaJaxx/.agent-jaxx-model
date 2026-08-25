import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  CONTROL_PLANE_FILES,
  agentDir,
  checkLogIntegrity,
  getRepoStatus,
  isGitAvailable,
  loadFrameConfig,
  type FrameConfig,
} from "@jaxx/core";

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  detail?: string;
}

export interface DoctorReport {
  root: string;
  projectName?: string;
  checks: CheckResult[];
  ok: boolean;
}

export interface DoctorOptions {
  quality?: boolean;
  /** Enable optional GitHub branch-protection probe (requires `gh` + network). */
  branchProtection?: boolean;
}

const STATUS_SYMBOL: Record<CheckStatus, string> = {
  pass: "[ok]",
  warn: "[!!]",
  fail: "[xx]",
  skip: "[--]",
};

export async function runDoctor(rootDir: string, opts: DoctorOptions = {}): Promise<DoctorReport> {
  const checks: CheckResult[] = [];
  const root = path.resolve(rootDir);

  // 1. Control plane integrity
  checks.push(checkControlPlane(root));

  // 2. Project configuration
  let cfg: FrameConfig | null = null;
  try {
    cfg = loadFrameConfig(root);
    checks.push({
      id: "config",
      title: "Project configuration (frame.config)",
      status: "pass",
      detail: `project="${cfg.project.name}" repos=${cfg.repos.length}`,
    });
  } catch (err) {
    checks.push({
      id: "config",
      title: "Project configuration (frame.config)",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Required environment variables from .env.example
  checks.push(checkEnv(root));

  // 4-6. Git / branches / working trees
  if (!isGitAvailable()) {
    checks.push({
      id: "git",
      title: "Git availability",
      status: "skip",
      detail: "git CLI not found; git checks skipped",
    });
  } else if (cfg) {
    for (const repo of cfg.repos) {
      checks.push(...checkRepo(root, repo));
    }
    if (opts.branchProtection) {
      checks.push(await checkBranchProtection(cfg));
    } else {
      checks.push({
        id: "branch-protection",
        title: "Branch protection (optional)",
        status: "skip",
        detail: "enable with --branch-protection (requires gh CLI and network)",
      });
    }
  }

  // 7. Docker containers
  checks.push(await checkDocker(cfg));

  // 8. Quality gate hook (implemented by @jaxx/analyzers; wired in doctor --quality)
  checks.push(qualityHook(opts.quality ?? false));

  const ok = checks.every((c) => c.status !== "fail");
  return { root, projectName: cfg?.project.name, checks, ok };
}

/** Overridden in Phase 4 when @jaxx/analyzers is wired into the CLI. */
function qualityHook(enabled: boolean): CheckResult {
  void enabled;
  return { id: "quality", title: "Quality gates", status: "skip", detail: "analyzers not wired yet" };
}

function checkControlPlane(root: string): CheckResult {
  const dir = agentDir(root);
  if (!fs.existsSync(dir)) {
    return {
      id: "control-plane",
      title: "Control plane (.agent/)",
      status: "fail",
      detail: ".agent directory not found — run `jaxx init` first",
    };
  }
  const missing = CONTROL_PLANE_FILES.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length > 0) {
    return {
      id: "control-plane",
      title: "Control plane (.agent/)",
      status: "fail",
      detail: `missing: ${missing.join(", ")}`,
    };
  }
  const integrity = checkLogIntegrity(root);
  if (integrity.malformed > 0) {
    return {
      id: "control-plane",
      title: "Control plane (.agent/)",
      status: "warn",
      detail: `${integrity.malformed} malformed line(s) in AGENT_LOG.jsonl (preserved, never destroyed); valid=${integrity.valid}`,
    };
  }
  if (integrity.appendOnlyViolation) {
    return {
      id: "control-plane",
      title: "Control plane (.agent/)",
      status: "warn",
      detail: integrity.appendOnlyViolation,
    };
  }
  return {
    id: "control-plane",
    title: "Control plane (.agent/)",
    status: "pass",
    detail: `${integrity.valid} valid event(s) in AGENT_LOG.jsonl`,
  };
}

function parseEnvKeys(envExamplePath: string): string[] {
  try {
    const raw = fs.readFileSync(envExamplePath, "utf8");
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split("=")[0].trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function checkEnv(root: string): CheckResult {
  const envExample = path.join(root, ".env.example");
  const keys = parseEnvKeys(envExample);
  if (keys.length === 0) {
    return { id: "env", title: "Environment variables", status: "skip", detail: "no .env.example found" };
  }
  let dotenv: Record<string, string> = {};
  const dotenvPath = path.join(root, ".env");
  if (fs.existsSync(dotenvPath)) {
    dotenv = Object.fromEntries(
      fs
        .readFileSync(dotenvPath, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  }
  const missing = keys.filter(
    (k) => !(k in dotenv) && !(k in process.env) && !dotenv[k],
  );
  if (missing.length > 0) {
    return {
      id: "env",
      title: "Environment variables",
      status: "warn",
      detail: `missing from .env/environment: ${missing.join(", ")}`,
    };
  }
  return { id: "env", title: "Environment variables", status: "pass", detail: `${keys.length} key(s) present` };
}

function checkRepo(
  rootDir: string,
  repo: { name: string; path: string; defaultBranch: string },
): CheckResult[] {
  const results: CheckResult[] = [];
  const abs = path.resolve(rootDir, repo.path);
  if (!fs.existsSync(abs)) {
    return [
      {
        id: `repo:${repo.name}`,
        title: `Repo ${repo.name}`,
        status: "fail",
        detail: `path does not exist: ${abs}`,
      },
    ];
  }
  const st = getRepoStatus(abs);
  if (!st.isRepo) {
    return [{ id: `repo:${repo.name}`, title: `Repo ${repo.name}`, status: "fail", detail: `not a git repository: ${abs}` }];
  }
  const branchLabel = st.branch ?? st.hash ?? "(no commits yet)";
  results.push({
    id: `repo:${repo.name}:branch`,
    title: `Repo ${repo.name} — branch`,
    status: "pass",
    detail:
      st.hash == null
        ? `${repo.name}: repository has no commits yet`
        : `on "${branchLabel}" (default "${repo.defaultBranch}")${(st.branches ?? []).includes(repo.defaultBranch) ? "" : ` — NOTE: default branch "${repo.defaultBranch}" has no local ref yet`}`,
  });
  results.push({
    id: `repo:${repo.name}:tree`,
    title: `Repo ${repo.name} — working tree`,
    status: st.dirty ? "warn" : "pass",
    detail: st.dirty ? "dirty (uncommitted changes)" : "clean",
  });
  return results;
}

async function checkDocker(cfg: FrameConfig | null): Promise<CheckResult> {
  const containers = cfg?.docker.containers ?? [];
  if (containers.length === 0) {
    return { id: "docker", title: "Docker containers", status: "skip", detail: "no containers configured" };
  }
  const version = await runCmd("docker", ["ps", "--format", "{{.Names}}"]);
  if (version == null) {
    return {
      id: "docker",
      title: "Docker containers",
      status: "skip",
      detail: "docker CLI unavailable; cannot verify container status",
    };
  }
  const running = new Set(version.split("\n").filter(Boolean));
  const notRunning = containers.filter((c) => !running.has(c));
  if (notRunning.length > 0) {
    return {
      id: "docker",
      title: "Docker containers",
      status: "fail",
      detail: `not running: ${notRunning.join(", ")}`,
    };
  }
  return { id: "docker", title: "Docker containers", status: "pass", detail: `${containers.length} running` };
}

async function checkBranchProtection(cfg: FrameConfig): Promise<CheckResult> {
  const ghPath = await runCmd("gh", ["--version"]);
  if (ghPath == null) {
    return { id: "branch-protection", title: "Branch protection (GitHub)", status: "skip", detail: "gh CLI not available" };
  }
  for (const repo of cfg.repos) {
    const origin = runGitRemoteUrl(path.resolve(repo.path));
    if (!origin) continue;
    const m = origin.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!m) continue;
    const out = await runCmd("gh", [
      "api",
      `-H=Accept: application/vnd.github+json`,
      `repos/${m[1]}/${m[2]}/branches/${repo.defaultBranch}/protection`,
    ]);
    if (out == null) {
      return {
        id: "branch-protection",
        title: "Branch protection (GitHub)",
        status: "warn",
        detail: `${repo.name}:${repo.defaultBranch} — no protection rule or API error`,
      };
    }
    return {
      id: "branch-protection",
      title: "Branch protection (GitHub)",
      status: "pass",
      detail: `${repo.name}:${repo.defaultBranch} protected`,
    };
  }
  return { id: "branch-protection", title: "Branch protection (GitHub)", status: "skip", detail: "no GitHub remotes configured" };
}

function runGitRemoteUrl(cwd: string): string | null {
  try {
    const r = spawnSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8", timeout: 5000, windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return r.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function runCmd(cmd: string, args: string[]): Promise<string | null> {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 10_000, windowsHide: true, shell: false });
    if (r.error) return null;
    if (r.status !== 0) return null;
    return r.stdout.trim();
  } catch {
    return null;
  }
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`jaxx doctor — ${report.projectName ?? report.root}`);
  lines.push("");
  for (const c of report.checks) {
    lines.push(`${STATUS_SYMBOL[c.status]} ${c.title}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  lines.push("");
  lines.push(report.ok ? "Result: PASS" : "Result: FAIL (see [xx] items)");
  return lines.join("\n");
}
