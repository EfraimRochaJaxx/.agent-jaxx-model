import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAnalyzers } from "../src";

let proj: string;
beforeAll(() => {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-analyze-"));
  fs.writeFileSync(
    path.join(proj, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: false }, include: [] }),
    "utf8",
  );
});
afterAll(() => {
  fs.rmSync(proj, { recursive: true, force: true, maxRetries: 3 });
});

function writeSrc(rel: string, code: string): void {
  const p = path.join(proj, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, code, "utf8");
}

describe("cyclomatic complexity", () => {
  it("flags functions above the threshold", () => {
    const branches = Array.from({ length: 12 }, (_, i) => `if (x > ${i}) { y += ${i}; }`).join("\n    ");
    writeSrc(
      "complex.ts",
      `export function tangled(x: number): number {\n  let y = 0;\n    ${branches}\n  return y;\n}\nexport function simple(): number { return 1; }\n`,
    );
    const result = runAnalyzers(proj, { maxComplexity: 10 });
    expect(result.passed).toBe(false);
    const v = result.scorecard.complexity.violations.find((x) => x.function === "tangled");
    expect(v).toBeDefined();
    expect(v!.complexity).toBeGreaterThan(10);
  });

  it("respects custom thresholds and exclusion globs", () => {
    const result = runAnalyzers(proj, { maxComplexity: 50 });
    expect(result.passed).toBe(true);
    const excluded = runAnalyzers(proj, { maxComplexity: 1, exclude: ["**/*.ts"] });
    expect(excluded.scorecard.filesAnalyzed).toBe(0);
  });
});

describe("duplication", () => {
  it("detects duplicated blocks across files", () => {
    const block = Array.from({ length: 8 }, (_, i) => `const w${i} = compute(${i}, "arg");`).join("\n");
    writeSrc("dupa.ts", `${block}\nexport const A = w0;\n`);
    writeSrc("dupb.ts", `${block}\nexport const B = w1;\n`);
    writeSrc("compute.ts", "function compute(n: number, s: string): number { return n + s.length; }\n");
    const result = runAnalyzers(proj, { maxComplexity: 100, maxDuplicationRatio: 0.01 });
    expect(result.passed).toBe(false);
    expect(result.scorecard.duplication.ratio).toBeGreaterThan(0.01);
    expect(result.scorecard.duplication.worstBlocks.length).toBeGreaterThan(0);
  });

  it("markdown summary renders PASS/FAIL", () => {
    const ok = runAnalyzers(proj, { maxDuplicationRatio: 1, maxComplexity: 100 });
    expect(ok.markdown).toContain("PASS");
    const bad = runAnalyzers(proj, { maxDuplicationRatio: 0 });
    expect(bad.markdown).toContain("FAIL");
  });
});
