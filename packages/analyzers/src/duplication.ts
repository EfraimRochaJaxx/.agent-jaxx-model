import { createHash } from "node:crypto";

/**
 * APPROXIMATE duplication detection: normalized sliding windows of
 * MIN_BLOCK consecutive significant lines hashed across files. Windows with
 * identical hashes in 2+ locations count as duplicated.
 */

export interface DuplicationBlock {
  hash: string;
  occurrences: { file: string; line: number }[];
  sample: string;
}

export interface DuplicationReport {
  ratio: number;
  blocks: DuplicationBlock[];
  linesTotal: number;
  linesDuplicated: number;
}

const MIN_BLOCK = 5;

function normalize(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

export function analyzeDuplication(files: { path: string; text: string }[]): DuplicationReport {
  const index = buildWindowIndex(files);
  const blocks = collectDuplicatedBlocks(index.windows);
  const linesTotal = index.linesTotal;
  let linesDuplicated = 0;
  for (const b of blocks) {
    linesDuplicated += MIN_BLOCK * (b.occurrences.length - 1);
  }
  return {
    ratio: linesTotal === 0 ? 0 : Math.min(1, linesDuplicated / linesTotal),
    blocks: blocks.sort((a, b) => b.occurrences.length - a.occurrences.length),
    linesTotal,
    linesDuplicated,
  };
}

interface WindowIndex {
  windows: Map<string, { file: string; line: number }[]>;
  samples: Map<string, string>;
  linesTotal: number;
}

function significantLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(normalize)
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"));
}

function buildWindowIndex(files: { path: string; text: string }[]): WindowIndex {
  const windows = new Map<string, { file: string; line: number }[]>();
  const samples = new Map<string, string>();
  let linesTotal = 0;

  for (const f of files) {
    const lines = significantLines(f.text);
    linesTotal += lines.length;
    for (let i = 0; i + MIN_BLOCK <= lines.length; i++) {
      const chunk = lines.slice(i, i + MIN_BLOCK).join("\n");
      const hash = createHash("sha1").update(chunk).digest("hex").slice(0, 12);
      const list = windows.get(hash) ?? [];
      list.push({ file: f.path, line: i + 1 });
      windows.set(hash, list);
      if (!samples.has(hash)) samples.set(hash, lines.slice(i, i + 3).join("\n"));
    }
  }
  return { windows, samples, linesTotal };
}

function collectDuplicatedBlocks(windows: Map<string, { file: string; line: number }[]>): DuplicationBlock[] {
  const blocks: DuplicationBlock[] = [];
  for (const [hash, occ] of windows) {
    // Only flag cross-location duplicates within/across distinct files.
    const distinctFiles = new Set(occ.map((o) => o.file)).size;
    if (occ.length >= 2 && (distinctFiles >= 2 || occ.length >= 3)) {
      blocks.push({ hash, occurrences: occ.slice(0, 10), sample: "" });
    }
  }
  return blocks;
}
