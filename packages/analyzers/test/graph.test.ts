import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Project } from "ts-morph";
import { analyzeDependencyGraph } from "../src/graph";

describe("analyzeDependencyGraph", () => {
  it("extracts direct and transitive dependencies and computes blast radius", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-graph-test-"));
    try {
      // Create a chain of files:
      // a.ts imports b.ts
      // b.ts imports c.ts
      // c.ts has 0 imports (base file)
      // d.ts is an orphan file (0 imports, 0 dependents)
      fs.writeFileSync(path.join(tmp, "c.ts"), "export const C = 42;\n");
      fs.writeFileSync(path.join(tmp, "b.ts"), "import { C } from './c';\nexport const B = C + 1;\n");
      fs.writeFileSync(path.join(tmp, "a.ts"), "import { B } from './b';\nexport const A = B * 2;\n");
      fs.writeFileSync(path.join(tmp, "d.ts"), "export const D = 100;\n");

      const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
      project.addSourceFilesAtPaths(path.join(tmp, "*.ts"));

      const report = analyzeDependencyGraph(project, tmp);

      expect(report.nodes).toHaveLength(4);
      expect(report.edges).toHaveLength(2); // a->b, b->c

      const nodeC = report.nodes.find((n) => n.name === "c.ts");
      expect(nodeC).toBeDefined();
      expect(nodeC?.importedBy).toEqual(["b.ts"]);
      // Blast radius of c.ts: altering c.ts affects b.ts and a.ts!
      expect(nodeC?.impact).toEqual(["a.ts", "b.ts"]);
      expect(nodeC?.impactCount).toBe(2);

      const nodeA = report.nodes.find((n) => n.name === "a.ts");
      expect(nodeA?.imports).toEqual(["b.ts"]);
      expect(nodeA?.importedBy).toEqual([]);
      expect(nodeA?.impact).toEqual([]);

      const nodeD = report.nodes.find((n) => n.name === "d.ts");
      expect(nodeD?.isOrphan).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("detects circular dependencies between modules", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-graph-cycle-"));
    try {
      // Circular chain: x -> y -> x
      fs.writeFileSync(path.join(tmp, "x.ts"), "import { Y } from './y';\nexport const X = 1;\n");
      fs.writeFileSync(path.join(tmp, "y.ts"), "import { X } from './x';\nexport const Y = 2;\n");

      const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
      project.addSourceFilesAtPaths(path.join(tmp, "*.ts"));

      const report = analyzeDependencyGraph(project, tmp);

      expect(report.metrics.circularCyclesCount).toBeGreaterThan(0);
      const nodeX = report.nodes.find((n) => n.name === "x.ts");
      const nodeY = report.nodes.find((n) => n.name === "y.ts");
      expect(nodeX?.isCircular).toBe(true);
      expect(nodeY?.isCircular).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
