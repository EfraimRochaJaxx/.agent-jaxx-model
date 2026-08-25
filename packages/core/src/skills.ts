import fs from "node:fs";
import path from "node:path";
import { SkillFrontmatterSchema, type SkillFrontmatter } from "./schemas";
import { skillsDir } from "./paths";

/**
 * Skill = Markdown file with YAML frontmatter.
 * Skills are UNTRUSTED INPUT: frontmatter is parsed declaratively (no YAML
 * execution, no shell interpolation) and content is data only. See
 * docs/security.md for the full trust model.
 */

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  filePath: string;
}

export interface SkillParseIssue {
  filePath: string;
  reason: string;
}

/** Parse a skill markdown file. Throws with a readable message on bad format. */
export function parseSkillFile(filePath: string): ParsedSkill {
  const raw = fs.readFileSync(filePath, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error(`missing YAML frontmatter (must start with --- block): ${filePath}`);
  const fmRaw = m[1];
  const body = raw.slice(m[0].length);
  const fields = parseSimpleYaml(fmRaw, filePath);
  const parsed = SkillFrontmatterSchema.safeParse(fields);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid skill frontmatter in ${filePath}: ${issues}`);
  }
  return { frontmatter: parsed.data, body, filePath };
}

/**
 * Minimal, deliberately limited YAML subset parser:
 * `key: value` lines and `key:` followed by `- item` lists.
 * No anchors, no multiline scalars, no aliases — by design.
 */
function parseSimpleYaml(text: string, filePath: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let currentListKey: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const listItem = line.match(/^\s+-\s*(.+)$/);
    if (listItem && currentListKey) {
      (out[currentListKey] as unknown[]).push(stripQuotes(listItem[1].trim()));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) throw new Error(`cannot parse frontmatter line in ${filePath}: "${line}"`);
    const key = kv[1];
    let value = kv[2].trim();
    if (value === "") {
      out[key] = [];
      currentListKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
      currentListKey = null;
    } else {
      out[key] = stripQuotes(value);
      currentListKey = null;
    }
  }
  return out;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export function listSkills(rootDir: string): { skills: ParsedSkill[]; issues: SkillParseIssue[] } {
  const dir = skillsDir(rootDir);
  const skills: ParsedSkill[] = [];
  const issues: SkillParseIssue[] = [];
  if (!fs.existsSync(dir)) return { skills, issues };
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      // Refuse symlinked entries (security boundary — see docs/security.md).
      if (entry.isSymbolicLink()) {
        issues.push({ filePath: path.join(dir, entry.name), reason: "symlinked skill refused" });
        continue;
      }
      try {
        skills.push(parseSkillFile(path.join(dir, entry.name)));
      } catch (err) {
        issues.push({
          filePath: path.join(dir, entry.name),
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  skills.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));
  return { skills, issues };
}

export function skillFileName(name: string): string {
  return `${name}.md`;
}
