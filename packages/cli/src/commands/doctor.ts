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
  runGit,
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
  /** Enforce that any staged code changes must be accompanied by an audit trail in .agent/. */
  enforceAuditTrail?: boolean;
  /** Evaluate AST dependency graph and transitive blast radius of staged files. */
  blastRadius?: boolean;
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

  // 2. Gitignore audit integrity (prevent .agent/ exclusion)
  checks.push(checkGitIgnore(root));

  // 3. Project configuration
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

  // 8. Quality gate (cyclomatic complexity / duplication via @jaxx/analyzers)
  checks.push(qualityGate(root, cfg, opts.quality ?? false));

  // 9. Deterministic Audit Trail Gate (enforces that staged changes include .agent/ updates)
  checks.push(checkAuditTrail(root, opts.enforceAuditTrail ?? false));

  // 10. AST Dependency & Blast Radius Impact Gate
  checks.push(checkBlastRadius(root, cfg, opts.blastRadius ?? false));

  const ok = checks.every((c) => c.status !== "fail");
  return { root, projectName: cfg?.project.name, checks, ok };
}

function getStagedFiles(root: string): string[] {
  if (!isGitAvailable()) return [];
  const raw = runGit(root, ["diff", "--cached", "--name-only"]);
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

function evaluateAuditTrail(staged: string[]): { status: CheckStatus; detail: string } {
  if (staged.length === 0) {
    return { status: "pass", detail: "no staged files" };
  }
  const codeModified = staged.some((f) => !f.startsWith(".agent/"));
  if (!codeModified) {
    return { status: "pass", detail: `${staged.length} staged file(s) (control plane update)` };
  }
  const auditModified = staged.some(
    (f) => f === ".agent/AGENT_LOG.jsonl" || f === ".agent/VERIFICATION.md",
  );
  if (!auditModified) {
    return {
      status: "fail",
      detail:
        "Code changes staged without an audit log or session verification entry in .agent/. Run 'jaxx log <LVL> \"<msg>\"' or 'jaxx session close' before committing.",
    };
  }
  return {
    status: "pass",
    detail: `${staged.length} staged file(s) with accompanying .agent/ audit trail`,
  };
}

function checkAuditTrail(root: string, enabled: boolean): CheckResult {
  if (!enabled) {
    return {
      id: "audit-trail",
      title: "Audit trail gate",
      status: "skip",
      detail: "enable in pre-commit verification or with --audit",
    };
  }
  const staged = getStagedFiles(root);
  const evaluated = evaluateAuditTrail(staged);
  return {
    id: "audit-trail",
    title: "Audit trail gate",
    status: evaluated.status,
    detail: evaluated.detail,
  };
}

function filterStagedSourceFiles(staged: string[]): string[] {
  return staged.filter(
    (f) =>
      /\.(ts|tsx|js|jsx)$/.test(f) &&
      !f.includes(".test.") &&
      !f.includes(".spec.") &&
      !f.startsWith(".agent/"),
  );
}

function inspectNodeImpact(
  src: string,
  node: { impact: string[] },
  hasStagedTests: boolean,
  totalImpacted: Set<string>,
): string | null {
  for (const imp of node.impact) totalImpacted.add(imp);
  const downstreamTests = node.impact.filter((imp) => imp.includes(".test.") || imp.includes(".spec."));
  if (downstreamTests.length > 0 && !hasStagedTests) {
    return `${path.basename(src)} (impacts ${downstreamTests.length} test file(s) but no tests are staged)`;
  }
  return null;
}

function collectBlastWarnings(
  stagedSources: string[],
  graph: { nodes: Array<{ id: string; impact: string[] }> },
  hasStagedTests: boolean,
  totalImpacted: Set<string>,
): string[] {
  const warnings: string[] = [];
  for (const src of stagedSources) {
    const node = graph.nodes.find((n) => n.id === src || n.id.replace(/\\/g, "/") === src);
    if (node) {
      const warn = inspectNodeImpact(src, node, hasStagedTests, totalImpacted);
      if (warn) warnings.push(warn);
    }
  }
  return warnings;
}

function evaluateBlastRadius(
  root: string,
  cfg: FrameConfig | null,
  staged: string[],
): { status: CheckStatus; detail: string } {
  if (staged.length === 0) return { status: "pass", detail: "no staged files" };
  const stagedSources = filterStagedSourceFiles(staged);
  if (stagedSources.length === 0) return { status: "pass", detail: "no source files modified in stage" };

  try {
    const { buildDependencyGraph } = require("@jaxx/analyzers") as typeof import("@jaxx/analyzers");
    const graph = buildDependencyGraph(root, cfg?.quality ?? {});
    const totalImpacted = new Set<string>();
    const hasStagedTests = staged.some((f) => f.includes(".test.") || f.includes(".spec."));
    const warnings = collectBlastWarnings(stagedSources, graph, hasStagedTests, totalImpacted);

    if (warnings.length > 0) {
      return { status: "warn", detail: `Cascading blast radius: ${warnings.join("; ")}` };
    }
    return {
      status: "pass",
      detail: `${stagedSources.length} source file(s) staged · total blast radius ${totalImpacted.size} downstream file(s)`,
    };
  } catch (err) {
    return {
      status: "skip",
      detail: `blast radius evaluation skipped: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function checkBlastRadius(root: string, cfg: FrameConfig | null, enabled: boolean): CheckResult {
  if (!enabled) {
    return {
      id: "blast-radius",
      title: "Blast radius impact gate",
      status: "skip",
      detail: "run jaxx verify to analyze",
    };
  }
  const staged = getStagedFiles(root);
  const evaluated = evaluateBlastRadius(root, cfg, staged);
  return {
    id: "blast-radius",
    title: "Blast radius impact gate",
    status: evaluated.status,
    detail: evaluated.detail,
  };
}

function qualityGate(root: string, cfg: FrameConfig | null, enabled: boolean): CheckResult {
  const qCfg = cfg?.quality;
  if (!enabled) {
    return { id: "quality", title: "Quality gates", status: "skip", detail: "run `jaxx doctor --quality` to analyze" };
  }
  if (qCfg?.enabled === false) {
    return { id: "quality", title: "Quality gates", status: "skip", detail: "disabled in frame.config" };
  }
  try {
    // Lazy import so plain `doctor` never pays the analyzer cost.
    const { runAnalyzers, persistResults } = require("@jaxx/analyzers") as typeof import("@jaxx/analyzers");
    const result = runAnalyzers(root, qCfg ?? {});
    persistResults(root, result);
    if (!result.passed) {
      return {
        id: "quality",
        title: "Quality gates",
        status: "fail",
        detail: result.scorecard.violations.slice(0, 5).join("; ") + (result.scorecard.violations.length > 5 ? "; …" : ""),
      };
    }
    return {
      id: "quality",
      title: "Quality gates",
      status: "pass",
      detail: `${result.scorecard.filesAnalyzed} files · max complexity ${result.scorecard.complexity.maxObserved} · duplication ${(result.scorecard.duplication.ratio * 100).toFixed(1)}%`,
    };
  } catch (err) {
    return {
      id: "quality",
      title: "Quality gates",
      status: "warn",
      detail: `analysis error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function checkGitIgnore(root: string): CheckResult {
  const gitignorePath = path.join(root, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    return {
      id: "gitignore",
      title: ".gitignore audit integrity",
      status: "pass",
      detail: "no .gitignore found",
    };
  }
  const content = fs.readFileSync(gitignorePath, "utf8");
  const lines = content.split("\n").map((l) => l.trim());
  const ignoresAgent = lines.some(
    (l) => !l.startsWith("#") && (l === ".agent" || l === ".agent/" || l === "/.agent" || l === "/.agent/"),
  );
  if (ignoresAgent) {
    return {
      id: "gitignore",
      title: ".gitignore audit integrity",
      status: "fail",
      detail: "Illegal rule detected: .agent/ must never be added to .gitignore",
    };
  }
  return {
    id: "gitignore",
    title: ".gitignore audit integrity",
    status: "pass",
    detail: ".agent/ control plane correctly preserved",
  };
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
  const missing = CONTROL_PLANE_FILES.filter(
    (f) => f !== "AGENT_LOG.jsonl" && !fs.existsSync(path.join(dir, f)),
  );
  if (missing.length > 0) {
    return {
      id: "control-plane",
      title: "Control plane (.agent/)",
      status: "fail",
      detail: `missing: ${missing.join(", ")}`,
    };
  }
  const logPath = path.join(dir, "AGENT_LOG.jsonl");
  if (!fs.existsSync(logPath)) {
    return {
      id: "control-plane",
      title: "Control plane (.agent/)",
      status: "pass",
      detail: "all governance documents present (local AGENT_LOG.jsonl initialized on demand)",
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
  const isPrimary = repo.path === "." || path.relative(rootDir, abs) === "";
  if (!fs.existsSync(abs)) {
    if (!isPrimary) {
      return [
        {
          id: `repo:${repo.name}`,
          title: `Repo ${repo.name}`,
          status: "skip",
          detail: `sibling path not found (standalone/CI mode): ${abs}`,
        },
      ];
    }
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
    if (!isPrimary) {
      return [
        {
          id: `repo:${repo.name}`,
          title: `Repo ${repo.name}`,
          status: "skip",
          detail: `sibling not a git repository (standalone/CI mode): ${abs}`,
        },
      ];
    }
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
