import path from "node:path";
import type { Project, SourceFile } from "ts-morph";
import { analyzeComplexity } from "./complexity";

export interface GraphNode {
  id: string; // canonical relative path, e.g. "packages/core/src/schemas.ts"
  name: string; // filename basename, e.g. "schemas.ts"
  dir: string; // directory relative to root, e.g. "packages/core/src"
  linesOfCode: number;
  maxComplexity: number;
  imports: string[]; // files this file directly imports
  importedBy: string[]; // files that directly import this file
  impact: string[]; // all transitive files affected if this file changes
  impactCount: number;
  isCircular: boolean;
  isOrphan: boolean;
}

export interface GraphEdge {
  source: string; // importer file id
  target: string; // imported file id
  isCircular?: boolean;
}

export interface DependencyGraphReport {
  generatedAt: string;
  root: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metrics: {
    totalFiles: number;
    totalEdges: number;
    circularCyclesCount: number;
    orphansCount: number;
    highestImpactFile: { id: string; impactCount: number } | null;
  };
  circularCycles: string[][];
}

function toRel(rootDir: string, absPath: string): string {
  return path.relative(rootDir, absPath).split(path.sep).join("/");
}

function resolvePackageCandidate(rootDir: string, specifier: string, allFilesSet: Set<string>): string | null {
  const match = specifier.match(/^@jaxx\/([a-z0-9-]+)(\/.*)?$/);
  if (!match) return null;

  const pkgName = match[1];
  const sub = match[2] ?? "";
  const candidates = [
    path.join(rootDir, "packages", pkgName, "src", sub ? `${sub}.ts` : "index.ts"),
    path.join(rootDir, "packages", pkgName, "src", sub ? `${sub}/index.ts` : "index.ts"),
    path.join(rootDir, "packages", pkgName, sub ? `${sub}.ts` : "src/index.ts"),
  ];

  for (const c of candidates) {
    const rel = toRel(rootDir, c);
    if (allFilesSet.has(rel)) return rel;
  }
  return null;
}

/**
 * Resolves a module specifier string (e.g. `./schemas` or `../types`)
 * to a canonical relative file path inside the project root.
 */
function resolveModulePath(
  rootDir: string,
  sourceFilePath: string,
  specifier: string,
  allFilesSet: Set<string>,
): string | null {
  if (!specifier.startsWith(".")) {
    return resolvePackageCandidate(rootDir, specifier, allFilesSet);
  }

  const dir = path.dirname(sourceFilePath);
  const rawTarget = path.resolve(dir, specifier);
  const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", ""];

  for (const ext of extensions) {
    const candidate = rawTarget + ext;
    const rel = toRel(rootDir, candidate);
    if (allFilesSet.has(rel)) return rel;
  }

  return null;
}

/**
 * Traverses the graph to calculate the transitive blast radius (all downstream
 * files that depend directly or indirectly on `startNodeId`).
 */
function computeBlastRadius(startNodeId: string, importedByMap: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const dependents = importedByMap.get(curr);
    if (!dependents) continue;

    for (const dep of dependents) {
      if (!visited.has(dep) && dep !== startNodeId) {
        visited.add(dep);
        queue.push(dep);
      }
    }
  }

  return [...visited].sort();
}

/**
 * Detects circular dependency cycles using DFS cycle finding.
 */
function findCircularCycles(nodes: string[], importsMap: Map<string, Set<string>>): { cycles: string[][]; circularNodes: Set<string> } {
  const cycles: string[][] = [];
  const circularNodes = new Set<string>();
  const visited = new Set<string>();
  const recStack: string[] = [];

  function dfs(curr: string) {
    visited.add(curr);
    recStack.push(curr);

    const neighbors = importsMap.get(curr) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else {
        const cycleStart = recStack.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = [...recStack.slice(cycleStart), neighbor];
          cycles.push(cycle);
          for (const n of cycle) circularNodes.add(n);
        }
      }
    }

    recStack.pop();
  }

  for (const node of nodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return { cycles, circularNodes };
}

function buildFileMaps(project: Project, rootDir: string): { allFilesSet: Set<string>; fileToSf: Map<string, SourceFile> } {
  const allFilesSet = new Set<string>();
  const fileToSf = new Map<string, SourceFile>();

  for (const sf of project.getSourceFiles()) {
    const rel = toRel(rootDir, sf.getFilePath());
    allFilesSet.add(rel);
    fileToSf.set(rel, sf);
  }
  return { allFilesSet, fileToSf };
}

function buildComplexityMap(project: Project, rootDir: string): Map<string, number> {
  const complexityReport = analyzeComplexity(project);
  const maxComplexityMap = new Map<string, number>();

  for (const f of complexityReport.findings) {
    const rel = toRel(rootDir, f.file);
    const existing = maxComplexityMap.get(rel) ?? 0;
    if (f.complexity > existing) {
      maxComplexityMap.set(rel, f.complexity);
    }
  }
  return maxComplexityMap;
}

function extractImports(sf: SourceFile): string[] {
  return [
    ...sf.getImportDeclarations().map((d) => d.getModuleSpecifierValue()),
    ...sf.getExportDeclarations().filter((d) => d.hasModuleSpecifier()).map((d) => d.getModuleSpecifierValue()!),
  ];
}

function processSourceFileImports(
  rel: string,
  sf: SourceFile,
  rootDir: string,
  allFilesSet: Set<string>,
  importsMap: Map<string, Set<string>>,
  importedByMap: Map<string, Set<string>>,
  edgeSet: Set<string>,
  edges: GraphEdge[],
): void {
  for (const spec of extractImports(sf)) {
    const resolved = resolveModulePath(rootDir, sf.getFilePath(), spec, allFilesSet);
    if (!resolved || resolved === rel) continue;

    importsMap.get(rel)!.add(resolved);
    importedByMap.get(resolved)!.add(rel);

    const edgeKey = `${rel}->${resolved}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({ source: rel, target: resolved });
    }
  }
}

function buildDependencyMaps(
  rootDir: string,
  allFilesSet: Set<string>,
  fileToSf: Map<string, SourceFile>,
): { importsMap: Map<string, Set<string>>; importedByMap: Map<string, Set<string>>; edges: GraphEdge[] } {
  const importsMap = new Map<string, Set<string>>();
  const importedByMap = new Map<string, Set<string>>();
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const rel of allFilesSet) {
    importsMap.set(rel, new Set());
    importedByMap.set(rel, new Set());
  }

  for (const [rel, sf] of fileToSf) {
    processSourceFileImports(rel, sf, rootDir, allFilesSet, importsMap, importedByMap, edgeSet, edges);
  }

  return { importsMap, importedByMap, edges };
}

function buildSingleNode(
  id: string,
  fileToSf: Map<string, SourceFile>,
  importsMap: Map<string, Set<string>>,
  importedByMap: Map<string, Set<string>>,
  maxComplexityMap: Map<string, number>,
  circularNodes: Set<string>,
): GraphNode {
  const sf = fileToSf.get(id)!;
  const linesOfCode = sf.getFullText().split("\n").length;
  const directImports = [...(importsMap.get(id) ?? [])].sort();
  const directImportedBy = [...(importedByMap.get(id) ?? [])].sort();
  const impact = computeBlastRadius(id, importedByMap);

  return {
    id,
    name: path.basename(id),
    dir: path.dirname(id).split(path.sep).join("/"),
    linesOfCode,
    maxComplexity: maxComplexityMap.get(id) ?? 1,
    imports: directImports,
    importedBy: directImportedBy,
    impact,
    impactCount: impact.length,
    isCircular: circularNodes.has(id),
    isOrphan: directImports.length === 0 && directImportedBy.length === 0,
  };
}

/**
 * Analyzes the dependency graph of all TypeScript files in the project.
 */
export function analyzeDependencyGraph(project: Project, rootDir: string): DependencyGraphReport {
  const { allFilesSet, fileToSf } = buildFileMaps(project, rootDir);
  const maxComplexityMap = buildComplexityMap(project, rootDir);
  const { importsMap, importedByMap, edges } = buildDependencyMaps(rootDir, allFilesSet, fileToSf);

  const allNodeIds = [...allFilesSet].sort();
  const { cycles, circularNodes } = findCircularCycles(allNodeIds, importsMap);

  for (const edge of edges) {
    edge.isCircular = circularNodes.has(edge.source) && circularNodes.has(edge.target);
  }

  const nodes: GraphNode[] = allNodeIds.map((id) =>
    buildSingleNode(id, fileToSf, importsMap, importedByMap, maxComplexityMap, circularNodes),
  );

  let highestImpact: { id: string; impactCount: number } | null = null;
  for (const n of nodes) {
    if (!highestImpact || n.impactCount > highestImpact.impactCount) {
      highestImpact = { id: n.id, impactCount: n.impactCount };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    root: rootDir,
    nodes,
    edges,
    metrics: {
      totalFiles: nodes.length,
      totalEdges: edges.length,
      circularCyclesCount: cycles.length,
      orphansCount: nodes.filter((n) => n.isOrphan).length,
      highestImpactFile: highestImpact,
    },
    circularCycles: cycles,
  };
}
