import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EXIT, flagBool, flagStr, type ParsedArgs } from "../args";
import { listSkills, parseSkillFile, skillFileName } from "@jaxx/core";

/**
 * Skills registry CLI.
 *
 * TRUST MODEL: external skills are UNTRUSTED INPUT. `skill install` clones,
 * validates frontmatter against the Zod schema, and copies Markdown as plain
 * data. Nothing from an external repository is ever executed, required or
 * interpreted as configuration. See docs/security.md.
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
    throw new Error('skill add requires a valid name: jaxx skill add my-skill');
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
  const description = flagStr(args, "description") ?? "TODO: describe what this skill does";
  const trigger = flagStr(args, "trigger") ?? "TODO: when should an agent apply this skill";
  const tools = (flagStr(args, "tools") ?? "read").split(",").map((t) => t.trim()).filter(Boolean);
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
  if (json) console.log(JSON.stringify({ ok: true, added: target }));
  else console.log(`Added skill: ${target}`);
  return EXIT.OK;
}

function cmdSkillList(root: string, json: boolean): number {
  const { skills, issues } = listSkills(root);
  if (json) {
    console.log(
      JSON.stringify(
        {
          skills: skills.map((s) => ({ ...s.frontmatter, file: path.basename(s.filePath) })),
          issues,
        },
        null,
        2,
      ),
    );
    return issues.length > 0 ? EXIT.CONFIG : EXIT.OK;
  }
  if (skills.length === 0) console.log("No skills installed. Try: jaxx skill add <name>");
  for (const s of skills) {
    console.log(`${s.frontmatter.name} v${s.frontmatter.version} (${path.basename(s.filePath)})`);
    console.log(`  ${s.frontmatter.description}`);
    console.log(`  trigger: ${s.frontmatter.trigger}`);
    console.log(`  allowedTools: ${s.frontmatter.allowedTools.join(", ") || "(none)"}`);
  }
  for (const i of issues) console.error(`[!!] ${i.filePath}: ${i.reason}`);
  return issues.length > 0 ? EXIT.CONFIG : EXIT.OK;
}

async function cmdSkillInstall(
  positional: string[],
  root: string,
  args: ParsedArgs,
  json: boolean,
): Promise<number> {
  const repoUrl = positional[0];
  if (!repoUrl) throw new Error("skill install requires a git URL: jaxx skill install https://github.com/org/repo.git");
  // Only allow https / ssh git URLs — block file:// and plain local paths
  // unless explicitly opted in (local testing).
  const allowLocal = flagBool(args, "allow-local");
  const isRemote = /^https:\/\/.+/.test(repoUrl) || /^git@[\w.-]+:.+/.test(repoUrl);
  const isLocalPath = !isRemote;
  if (isLocalPath && !allowLocal) {
    throw new Error(`refusing non-https/non-ssh source "${repoUrl}" (pass --allow-local for local testing)`);
  }
  if (/^file:/i.test(repoUrl) && !allowLocal) {
    throw new Error("file:// sources are not allowed");
  }

  const ref = flagStr(args, "ref");
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-skill-install-"));
  try {
    const cloneDir = path.join(tmpBase, "repo");
    const cloneArgs = ["clone", "--depth", "1"];
    if (ref) cloneArgs.push("--branch", ref, "--single-branch");
    cloneArgs.push("--", repoUrl, cloneDir);
    const r = spawnSync("git", cloneArgs, { encoding: "utf8", timeout: 120_000, windowsHide: true });
    if (r.error || r.status !== 0) {
      throw new Error(`git clone failed: ${(r.stderr || r.error?.message || "unknown error").trim().split("\n")[0]}`);
    }

    // Discover candidate skills (*.md at repo root and under skills/)
    const candidates = await findSkillFiles(cloneDir);

    // Validate everything BEFORE touching the project's registry.
    const validated: { src: string; fm: ReturnType<typeof parseSkillFile>["frontmatter"] }[] = [];
    const problems: string[] = [];
    for (const src of candidates) {
      // Symlinks anywhere in the candidate set are refused outright.
      const st = fs.lstatSync(src);
      if (st.isSymbolicLink() || !st.isFile()) {
        problems.push(`${path.relative(cloneDir, src)}: not a regular file`);
        continue;
      }
      try {
        const parsed = parseSkillFile(src);
        validated.push({ src, fm: parsed.frontmatter });
      } catch (err) {
        problems.push(`${path.relative(cloneDir, src)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (problems.length > 0 && validated.length === 0) {
      throw new Error(`no valid skills found in ${repoUrl}:\n  - ${problems.join("\n  - ")}`);
    }

    // Copy into the registry via read/write (never rename across devices),
    // re-checking that destinations stay inside .agent/skills/.
    const destDir = path.join(root, ".agent", "skills");
    fs.mkdirSync(destDir, { recursive: true });
    const installed: string[] = [];
    const skipped: string[] = [];
    for (const v of validated) {
      const dest = path.join(destDir, skillFileName(v.fm.name));
      const resolvedDest = path.resolve(dest);
      if (!resolvedDest.startsWith(path.resolve(destDir + path.sep))) {
        problems.push(`${v.fm.name}: resolved destination escapes skills directory`);
        continue;
      }
      if (fs.existsSync(resolvedDest)) {
        skipped.push(v.fm.name);
        continue;
      }
      // Content copy of the *validated* markdown only — never arbitrary files.
      const content = await fsp.readFile(v.src, "utf8");
      await fsp.writeFile(resolvedDest, content, { encoding: "utf8", mode: 0o644 });
      installed.push(v.fm.name);
    }

    const report = { ok: true, installed, skipped, problems };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      if (installed.length) console.log(`Installed: ${installed.join(", ")}`);
      if (skipped.length) console.log(`Skipped (already installed): ${skipped.join(", ")}`);
      for (const p of problems) console.error(`[!!] rejected: ${p}`);
      if (installed.length === 0 && skipped.length === 0) return EXIT.CONFIG;
    }
    return EXIT.OK;
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function findSkillFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
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
        if (e.name === "skills" || e.name === ".") await walk(full, depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
        out.push(full);
      }
    }
  }
  await walk(dir, 0);
  return out;
}
