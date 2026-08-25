import { Project, SyntaxKind, type Node } from "ts-morph";

/** Cyclomatic complexity per function-like node: 1 + decision points. */
export interface ComplexityFinding {
  file: string;
  function: string;
  complexity: number;
}

export interface ComplexityReport {
  findings: ComplexityFinding[];
  maxObserved: number;
  functionsAnalyzed: number;
}

const DECISION_KINDS = [
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
] as const;

const FUNCTION_KINDS = new Set<number>([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
]);

function nameOf(fn: Node): string {
  const named = fn as unknown as { getName?: () => string | undefined };
  if (typeof named.getName === "function") {
    const n = named.getName();
    if (n) return n;
  }
  const parent = fn.getParent() as
    | (Node & { getNameNode?: () => { getText(): string }; getInitializer?: () => Node | undefined })
    | undefined;
  const nameNode = parent?.getNameNode?.();
  if (nameNode) return nameNode.getText();
  if (parent?.getInitializer?.() === fn && "getName" in parent) {
    return ((parent as unknown as { getName: () => string }).getName() ?? "<anonymous>");
  }
  return "<anonymous>";
}

function hasFnAncestor(fn: Node): boolean {
  let p = fn.getParent();
  while (p) {
    if (FUNCTION_KINDS.has(p.getKind())) return true;
    p = p.getParent();
  }
  return false;
}

export function analyzeComplexity(project: Project): ComplexityReport {
  const findings: ComplexityFinding[] = [];
  let functionsAnalyzed = 0;
  let maxObserved = 0;

  for (const sf of project.getSourceFiles()) {
    // Outermost functions only; nested lambdas are counted within their parent.
    const fns = [
      ...sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
      ...sf.getDescendantsOfKind(SyntaxKind.MethodDeclaration),
      ...sf.getDescendantsOfKind(SyntaxKind.Constructor),
      ...sf.getDescendantsOfKind(SyntaxKind.GetAccessor),
      ...sf.getDescendantsOfKind(SyntaxKind.SetAccessor),
      ...sf.getDescendantsOfKind(SyntaxKind.ArrowFunction),
      ...sf.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ];

    for (const fn of fns) {
      if (hasFnAncestor(fn)) continue;
      let decisions = 0;
      for (const kind of DECISION_KINDS) decisions += fn.getDescendantsOfKind(kind).length;
      for (const bin of fn.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
        const op = bin.getOperatorToken().getKind();
        if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) decisions++;
      }
      const complexity = 1 + decisions;
      functionsAnalyzed++;
      maxObserved = Math.max(maxObserved, complexity);
      findings.push({ file: sf.getFilePath(), function: nameOf(fn), complexity });
    }
  }
  return { findings, maxObserved, functionsAnalyzed };
}
