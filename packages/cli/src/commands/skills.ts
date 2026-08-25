import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EXIT, flagBool, flagStr, type ParsedArgs } from "../args";
import { listSkills, parseSkillFile, skillFileName, type SkillFrontmatter } from "@jaxx/core";

/**
 * Skills registry CLI.
 *
 * TRUST MODEL: external skills are UNTRUSTED INPUT. `skill install` clones,
 * validates frontmatter against the Zod schema, and copies Markdown as plain
 * data. Nothing from an external repository is ever executed. See docs/security.md.
 */

export async function runSkill(args: ParsedArgs, json: boolean): Promise<number> {
  const sub = args.positional[0];
  const root = path.resolve(flagStr(args, "root") ?? ".");
  try {
    switch (sub) {
      case "add":
        return cmdSkillAdd(args.positional.slice(1), root, args, json);
      case "list":
        return cmdSkillList(root, json);
      case "install":
        return await cmdSkillInstall(args.positional.slice(1), root, args, json);
      default:
        console.error("Usage: jaxx skill <add <name>|list|install <repo-git>>");
        return EXIT.USAGE;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`error: ${msg}`);
    return EXIT.CONFIG;
  }
}

function cmdSkillAdd(positional: string[], root: string, args: ParsedArgs, json: boolean): number {
  const name = positional[0];
  if (!name || !/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    throw new Error("skill add requires a valid name: jaxx skill add my-skill");
  }
  const dir = path.join(root, ".agent", "skills");
  const target = path.join(dir, skillFileName(name));
  if (!target.startsWith(path.resolve(dir + path.sep))) {
    throw new Error("resolved skill path escapes the skills directory");
  }
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(target)) {
    throw new Error(`skill already exists: ${target} (edit it directly or remove it first)`);
  }
  writeSkillTemplate(target, name, args);
  if (json) console.log(JSON.stringify({ ok: true, added: target }));
  else console.log(`Added skill: ${target}`);
  return EXIT.OK;
}

function writeSkillTemplate(target: string, name: string, args: ParsedArgs): void {
  const description = flagStr(args, "description") ?? "TODO: describe what this skill does";
  const trigger = flagStr(args, "trigger") ?? "TODO: when should an agent apply this skill";
  const tools = parseTools(flagStr(args, "tools") ?? "read");
  const content = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    `trigger: ${trigger}`,
    `allowedTools:`,
    ...tools.map((t) => `  - ${t}`),
    `version: 0.1.0`,
    "---",
    "",
    `# ${name}`,
    "",
    "Describe the procedure, conventions and guardrails for this skill.",
    "",
  ].join("\n");
  fs.writeFileSync(target, content, "utf8");
}

function parseTools(raw: string): string[] {
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

function cmdSkillList(root: string, json: boolean): number {
  const { skills, issues } = listSkills(root);
  if (json) {
    console.log(
      JSON.stringify(
        { skills: skills.map((s) => ({ ...s.frontmatter, file: path.basename(s.filePath) })), issues },
        null,
        2,
      ),
    );
    return issues.length > 0 ? EXIT.CONFIG : EXIT.OK;
  }
  printSkillList(skills);
  for (const i of issues) console.error(`[!!] ${i.filePath}: ${i.reason}`);
  return issues.length > 0 ? EXIT.CONFIG : EXIT.OK;
}

function printSkillList(skills: { frontmatter: SkillFrontmatter; filePath: string }[]): void {
  if (skills.length === 0) console.log("No skills installed. Try: jaxx skill add <name>");
  for (const s of skills) {
    console.log(`${s.frontmatter.name} v${s.frontmatter.version} (${path.basename(s.filePath)})`);
    console.log(`  ${s.frontmatter.description}`);
    console.log(`  trigger: ${s.frontmatter.trigger}`);
    console.log(`  allowedTools: ${s.frontmatter.allowedTools.join(", ") || "(none)"}`);
  }
}

interface InstallReport {
  installed: string[];
  skipped: string[];
  problems: string[];
}

async function cmdSkillInstall(positional: string[], root: string, args: ParsedArgs, json: boolean): Promise<number> {
  const source = validateSource(positional[0], flagBool(args, "allow-local"));
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-skill-install-"));
  try {
    const candidates = await collectCandidates(source, tmpBase, flagStr(args, "ref"));
    const report = stageAndInstall(candidates, root);
    report.problems.push(...candidates.rejections);
    emitInstallReport(report, json);
    return report.installed.length + report.skipped.length > 0 ? EXIT.OK : EXIT.CONFIG;
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true, maxRetries: 3 });
  }
}

function validateSource(repoUrl: string | undefined, allowLocal: boolean): string {
  if (!repoUrl) throw new Error("skill install requires a git URL: jaxx skill install https://github.com/org/repo.git");
  const isRemote = /^https:\/\/.+/.test(repoUrl) || /^git@[\w.-]+:.+/.test(repoUrl);
  if (/^file:/i.test(repoUrl)) {
    if (!allowLocal) throw new Error("file:// sources are not allowed (use https/ssh git URLs)");
    return repoUrl;
  }
  if (!isRemote && !allowLocal) {
    throw new Error(`refusing non-https/non-ssh source "${repoUrl}" (pass --allow-local for local testing)`);
  }
  return repoUrl;
}

async function collectCandidates(
  repoUrl: string,
  tmpBase: string,
  ref?: string,
): Promise<{ files: string[]; rejections: string[] }> {
  const cloneDir = path.join(tmpBase, "repo");
  cloneRepo(repoUrl, cloneDir, ref);
  const files = (await findSkillFiles(cloneDir)).filter(isRegularFile);
  const rejections: string[] = [];
  return { files, rejections };
}

function isRegularFile(p: string): boolean {
  try {
    const st = fs.lstatSync(p);
    return st.isFile() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

function cloneRepo(repoUrl: string, dest: string, ref?: string): void {
  const cloneArgs = ["clone", "--depth", "1"];
  if (ref) cloneArgs.push("--branch", ref, "--single-branch");
  cloneArgs.push("--", repoUrl, dest);
  const r = spawnSync("git", cloneArgs, { encoding: "utf8", timeout: 120_000, windowsHide: true });
  if (r.error || r.status !== 0) {
    const detail = (r.stderr || r.error?.message || "unknown error").trim().split("\n")[0];
    throw new Error(`git clone failed: ${detail}`);
  }
}

function stageAndInstall(
  candidates: { files: string[]; rejections: string[] },
  root: string,
): InstallReport {
  // Validate everything BEFORE touching the registry.
  const validated: { src: string; fm: SkillFrontmatter }[] = [];
  const problems = [...candidates.rejections];
  for (const src of candidates.files) {
    try {
      validated.push({ src, fm: parseSkillFile(src).frontmatter });
    } catch (err) {
      const relLabel = src.split(/[\\/]repo[\\/]/).pop() ?? src;
      problems.push(`${relLabel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const destDir = path.join(root, ".agent", "skills");
  fs.mkdirSync(destDir, { recursive: true });
  const installed: string[] = [];
  const skipped: string[] = [];
  for (const v of validated) {
    const outcome = installOne(v.src, v.fm, destDir);
    if (outcome === "installed") installed.push(v.fm.name);
    else if (outcome === "skipped") skipped.push(v.fm.name);
  }
  return { installed, skipped, problems };
}

function installOne(src: string, fm: SkillFrontmatter, destDir: string): "installed" | "skipped" | "rejected" {
  const resolvedDest = path.resolve(path.join(destDir, skillFileName(fm.name)));
  if (!resolvedDest.startsWith(path.resolve(destDir + path.sep))) return "rejected";
  if (fs.existsSync(resolvedDest)) return "skipped";
  // Content copy of the validated markdown only — never arbitrary files.
  const content = fs.readFileSync(src, "utf8");
  fs.writeFileSync(resolvedDest, content, { encoding: "utf8", mode: 0o644 });
  return "installed";
}

function emitInstallReport(report: InstallReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
    return;
  }
  if (report.installed.length) console.log(`Installed: ${report.installed.join(", ")}`);
  if (report.skipped.length) console.log(`Skipped (already installed): ${report.skipped.join(", ")}`);
  for (const p of report.problems) console.error(`[!!] rejected: ${p}`);
}

async function findSkillFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  await walk(dir, 0);
  return out;

  async function walk(d: string, depth: number): Promise<void> {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "skills") await walk(full, depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
        out.push(full);
      }
    }
  }
}
