import { Project, SyntaxKind, type SourceFile } from "ts-morph";
import path from "node:path";

/**
 * APPROXIMATE dead-code detection: exported symbols never referenced by any
 * OTHER source file in the analysis set. Entry-point-ish files (index.*,
 * main.*, *.config.*, *.test.*, bin scripts) are exempt.
 * Heuristic — results are advisory, never destructive.
 */

export interface DeadCodeCandidate {
  file: string;
  symbol: string;
}

export interface DeadCodeReport {
  candidates: DeadCodeCandidate[];
  exportsScanned: number;
}

const ENTRY_FILE = /(^|[/\\])(index|main|bin|cli)(\.[jt]sx?)?$|\.config\.[jt]s$|\.(test|spec)\.[jt]sx?$/i;

interface ExportedSymbol {
  file: string;
  symbol: string;
}

function collectExports(sf: SourceFile): ExportedSymbol[] {
  const out: ExportedSymbol[] = [];
  for (const decls of sf.getExportedDeclarations().values()) {
    for (const d of decls) {
      if (typeof d !== "object" || d == null) continue;
      const named = d as { getName?: unknown };
      const name =
        typeof named.getName === "function" ? (named.getName as () => string)() : undefined;
      out.push({ file: sf.getFilePath(), symbol: name ?? "default" });
    }
  }
  return out;
}

function isReferencedElsewhere(symbol: string, ownFile: string, usage: Map<string, Set<string>>, sources: readonly SourceFile[]): boolean {
  for (const [filePath, ids] of usage) {
    if (filePath !== ownFile && ids.has(symbol)) return true;
  }
  return reExportedSomewhere(sources, path.basename(ownFile), symbol);
}

function reExportedSomewhere(sources: readonly SourceFile[], fileName: string, symbol: string): boolean {
  const pattern = new RegExp(`from\\s+["'][^"']*${fileName.replace(/[.*+?^${}()|[\\\]]/g, "\\$&")}["']`);
  return sources.some((sf) => pattern.test(sf.getFullText()) && sf.getFullText().includes(symbol));
}

export function analyzeDeadCode(project: Project): DeadCodeReport {
  const sources = project.getSourceFiles();
  const usage = new Map<string, Set<string>>();
  const exports: ExportedSymbol[] = [];

  for (const sf of sources) {
    const used = new Set<string>();
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) used.add(id.getText());
    usage.set(sf.getFilePath(), used);
    if (!ENTRY_FILE.test(sf.getFilePath())) exports.push(...collectExports(sf));
  }

  const candidates: DeadCodeCandidate[] = [];
  for (const e of exports) {
    if (!isReferencedElsewhere(e.symbol, e.file, usage, sources)) {
      candidates.push({ file: e.file, symbol: e.symbol });
    }
  }
  return { candidates, exportsScanned: exports.length };
}
