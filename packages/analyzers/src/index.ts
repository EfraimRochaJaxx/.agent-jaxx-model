import fs from "node:fs";
import path from "node:path";
import { Project } from "ts-morph";
import type { QualityConfig } from "@jaxx/core";
import { analyzeComplexity, type ComplexityFinding } from "./complexity";
import { analyzeDeadCode, type DeadCodeCandidate } from "./deadcode";
import { analyzeDuplication, type DuplicationReport } from "./duplication";

export interface Scorecard {
  generatedAt: string;
  root: string;
  thresholds: { maxComplexity: number; maxDuplicationRatio: number };
  filesAnalyzed: number;
  functionsAnalyzed: number;
  complexity: {
    maxObserved: number;
    violations: ComplexityFinding[];
    topFunctions: ComplexityFinding[];
  };
  deadCode: {
    candidates: DeadCodeCandidate[];
    note: string;
  };
  duplication: Pick<DuplicationReport, "ratio" | "linesTotal" | "linesDuplicated"> & {
    worstBlocks: { hash: string; count: number; firstOccurrence: string }[];
  };
  passed: boolean;
  violations: string[];
}

export interface AnalysisResult {
  scorecard: Scorecard;
  markdown: string;
  passed: boolean;
}

/** Minimal glob matching (** and *), no external deps. */
export function globToRegExp(glob: string): RegExp {
  const re = glob
    .replace(/[.+^${}()|[\]\\?]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/\u0000/g, "(?:.*[\\\\/])?")
    .replace(/\u0001/g, ".*")
    .replace(/\\\?/g, ".");
  return new RegExp(`^${re}$`);
}

const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/*.d.ts"];

export function runAnalyzers(rootDir: string, config: Partial<QualityConfig>): AnalysisResult {
  const maxComplexity = config.maxComplexity ?? 10;
  const maxDuplicationRatio = config.maxDuplicationRatio ?? 0.05;
  const excludeGlobs = [...DEFAULT_EXCLUDE, ...(config.exclude ?? [])].map(globToRegExp);

  const project = new Project({
    tsConfigFilePath: resolveTsConfig(rootDir),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const sourceFiles = listSourceFiles(rootDir, excludeGlobs);
  for (const file of sourceFiles) project.addSourceFileAtPath(file);

  const complexity = analyzeComplexity(project);
  const deadCode = analyzeDeadCode(project);

  const dupFiles: { path: string; text: string }[] = [];
  for (const sf of project.getSourceFiles()) {
    dupFiles.push({ path: sf.getFilePath(), text: sf.getFullText() });
  }
  const duplication = analyzeDuplication(dupFiles);

  const violations: string[] = [];
  const complexViolations = complexity.findings.filter((f) => f.complexity > maxComplexity);
  for (const v of complexViolations) {
    violations.push(
      `complexity ${v.complexity} > ${maxComplexity}: ${rel(rootDir, v.file)}#${v.function}`,
    );
  }
  if (duplication.ratio > maxDuplicationRatio) {
    violations.push(
      `duplication ratio ${(duplication.ratio * 100).toFixed(1)}% > ${(maxDuplicationRatio * 100).toFixed(1)}%`,
    );
  }

  const scorecard: Scorecard = {
    generatedAt: new Date().toISOString(),
    root: rootDir,
    thresholds: { maxComplexity, maxDuplicationRatio },
    filesAnalyzed: sourceFiles.length,
    functionsAnalyzed: complexity.functionsAnalyzed,
    complexity: {
      maxObserved: complexity.maxObserved,
      violations: complexViolations.map((v) => ({ ...v, file: rel(rootDir, v.file) })),
      topFunctions: complexity.findings
        .slice()
        .sort((a, b) => b.complexity - a.complexity)
        .slice(0, 10)
        .map((f) => ({ ...f, file: rel(rootDir, f.file) })),
    },
    deadCode: {
      candidates: deadCode.candidates.slice(0, 50).map((c) => ({ ...c, file: rel(rootDir, c.file) })),
      note: `approximate — exported symbols never referenced by another analyzed file (${deadCode.exportsScanned} exports scanned); entry points exempt`,
    },
    duplication: {
      ratio: duplication.ratio,
      linesTotal: duplication.linesTotal,
      linesDuplicated: duplication.linesDuplicated,
      worstBlocks: duplication.blocks.slice(0, 5).map((b) => ({
        hash: b.hash,
        count: b.occurrences.length,
        firstOccurrence: `${rel(rootDir, b.occurrences[0].file)}:${b.occurrences[0].line}`,
      })),
    },
    passed: violations.length === 0,
    violations,
  };

  return { scorecard, markdown: renderMarkdown(scorecard), passed: scorecard.passed };
}

export function persistResults(rootDir: string, result: AnalysisResult): { jsonPath: string; mdPath: string } {
  const dir = path.join(rootDir, ".agent", "quality");
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, "latest.json");
  const mdPath = path.join(dir, "latest.md");
  fs.writeFileSync(jsonPath, JSON.stringify(result.scorecard, null, 2), "utf8");
  fs.writeFileSync(mdPath, result.markdown, "utf8");
  return { jsonPath, mdPath };
}

function renderMarkdown(s: Scorecard): string {
  const lines: string[] = [
    `# Quality Scorecard`,
    "",
    `- Generated: ${s.generatedAt}`,
    `- Files analyzed: ${s.filesAnalyzed} · Functions: ${s.functionsAnalyzed}`,
    `- Thresholds: complexity ≤ ${s.thresholds.maxComplexity}, duplication ≤ ${(s.thresholds.maxDuplicationRatio * 100).toFixed(0)}%`,
    `- Result: **${s.passed ? "PASS" : "FAIL"}**`,
    "",
  ];
  if (s.violations.length > 0) {
    lines.push("## Violations", "");
    for (const v of s.violations) lines.push(`- ${v}`);
    lines.push("");
  }
  lines.push(
    "## Top functions by complexity",
    "",
    ...s.complexity.topFunctions.slice(0, 5).map(
      (f) => `- \`${f.function}\` in ${f.file} — ${f.complexity}`,
    ),
    "",
    `## Duplication`,
    "",
    `- Ratio: ${(s.duplication.ratio * 100).toFixed(1)}% of ${s.duplication.linesTotal} significant lines`,
    ...s.duplication.worstBlocks.map((b) => `- block \`${b.hash}\` ×${b.count} (first: ${b.firstOccurrence})`),
    "",
    `## Dead code candidates (approximate)`,
    "",
    ...(s.deadCode.candidates.length === 0
      ? ["- none detected"]
      : s.deadCode.candidates.slice(0, 15).map((c) => `- \`${c.symbol}\` in ${c.file}`)),
    "",
    `_Note: ${s.deadCode.note}_`,
    "",
  );
  return lines.join("\n");
}

function rel(rootDir: string, p: string): string {
  return path.relative(rootDir, p).split(path.sep).join("/");
}

function resolveTsConfig(rootDir: string): string | undefined {
  const candidate = path.join(rootDir, "tsconfig.base.json");
  if (fs.existsSync(candidate)) return candidate;
  const root = path.join(rootDir, "tsconfig.json");
  if (fs.existsSync(root)) return root;
  return undefined;
}

function listSourceFiles(rootDir: string, exclude: RegExp[]): string[] {
  const out: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", ".agent"]);
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!skipDirs.has(e.name)) walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(e.name) || /\.d\.ts$/.test(e.name)) continue;
      const relp = path.relative(rootDir, full);
      if (exclude.some((re) => re.test(relp.split(path.sep).join("/")))) continue;
      out.push(full);
    }
  }
  walk(rootDir);
  return out;
}
