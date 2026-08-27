import fs from "node:fs";
import path from "node:path";
import { appendEvent, ensureControlPlane } from "@jaxx/core";

export function cmdInit(name: string, rootDir: string): { files: string[]; configPath: string } {
  if (!name) throw new Error("init requires a project name: jaxx init \"My Project\"");
  const agentDir = ensureControlPlane(rootDir, name);
  const configPath = path.join(agentDir, "frame.config.ts");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, generateFrameConfig(name), "utf8");
  }
  // First entry in the audit log — proves the append-only channel works
  // from the very first second of the project's control plane.
  appendEvent(rootDir, {
    lvl: "DONE",
    agent: "jaxx-init",
    msg: `Control plane initialized for "${name}"`,
  });
  // Install pre-commit, post-commit & pre-push hooks if git exists
  installGitHooks(rootDir);
  // Install automated GitHub Actions workflow
  installGitHubWorkflow(rootDir);
  // Install AGENTS.md operating rules for autonomous LLMs
  installAgentsProtocol(rootDir, name);
  // Install clean separation rules in .gitignore
  installGitIgnore(rootDir);

  const files = fs
    .readdirSync(agentDir)
    .map((f) => path.join(".agent", f))
    .sort();
  return { files, configPath };
}

function installGitHooks(rootDir: string): boolean {
  const gitDir = path.join(rootDir, ".git");
  if (!fs.existsSync(gitDir)) return false;
  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const preCommitPath = path.join(hooksDir, "pre-commit");
  if (!fs.existsSync(preCommitPath)) {
    const preCommitScript = `#!/bin/sh
# Agent Jaxx Model — Automated Pre-Commit Quality & Audit Gate
npx jaxx verify
`;
    fs.writeFileSync(preCommitPath, preCommitScript, { mode: 0o755 });
  }

  const postCommitPath = path.join(hooksDir, "post-commit");
  if (!fs.existsSync(postCommitPath)) {
    const postCommitScript = `#!/bin/sh
# Agent Jaxx Model — Automated Post-Commit Anti-Bypass Trap
if ! npx jaxx verify >/dev/null 2>&1; then
  echo ""
  echo "❌ [JAXX SECURITY TRAP] COMMIT REVERTIDO E DESTRUÍDO AUTOMATICAMENTE!"
  echo "O uso de --no-verify é estritamente proibido neste repositório."
  echo "O commit foi desfeito e seus arquivos voltaram para o estado alterado."
  echo "Abra a sessão com 'npx jaxx session open' e siga o fluxo para poder comitar."
  echo ""
  if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    git reset HEAD~1
  else
    git update-ref -d HEAD
    git rm --cached -r . 2>/dev/null || true
  fi
  exit 1
fi
`;
    fs.writeFileSync(postCommitPath, postCommitScript, { mode: 0o755 });
  }

  const prePushPath = path.join(hooksDir, "pre-push");
  if (!fs.existsSync(prePushPath)) {
    const prePushScript = `#!/bin/sh
# Agent Jaxx Model — Automated Pre-Push Quality & Audit Gate
npx jaxx verify
`;
    fs.writeFileSync(prePushPath, prePushScript, { mode: 0o755 });
  }

  return true;
}

function installAgentsProtocol(rootDir: string, projectName: string): boolean {
  const agentsPath = path.join(rootDir, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    const content = `# Protocolo de Operação do Agente — ${projectName}

Você é um agente autônomo trabalhando em **${projectName}** sob a governança do framework **Agent Jaxx Model**.
O plano de controle do projeto reside em \`.agent/\`.

## Regras Rígidas e Proibições
- **É TERMINANTEMENTE PROIBIDO** usar \`--no-verify\` ou \`-n\` no \`git commit\`. Qualquer tentativa ativará o rollback automático do hook \`post-commit\`.
- **É TERMINANTEMENTE PROIBIDO** adicionar \`.agent/\` ao \`.gitignore\`.
- Modificações de código devem SEMPRE ser acompanhadas de abertura e fechamento de sessão.

## Fluxo Obrigatório de Trabalho

### 1. Antes de qualquer alteração:
- Leia \`.agent/STATE.md\` e \`.agent/PLAN.md\`.
- Abra a sessão gerenciada:
  \`npx jaxx session open --agent <seu-nome>\`

### 2. Durante o trabalho:
- Registre ações significativas no log de auditoria:
  \`npx jaxx log <INFO|WARN|ERROR|DONE|GIT> "<mensagem>" --agent <seu-nome>\`

### 3. Antes de comitar:
- Valide os quality gates, trilha de auditoria e blast radius:
  \`npx jaxx verify\`
- Encerre a sessão com o sumário:
  \`npx jaxx session close --summary "<o que foi feito e como foi verificado>"\`

### 4. Commit:
- Faça o commit normalmente (sem nenhuma flag de bypass):
  \`git add -A && git commit -m "tipo(escopo): mensagem descritiva"\`
`;
    fs.writeFileSync(agentsPath, content, "utf8");
    return true;
  }
  return false;
}

function installGitHubWorkflow(rootDir: string): boolean {
  const workflowsDir = path.join(rootDir, ".github", "workflows");
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }
  const workflowPath = path.join(workflowsDir, "jaxx-ci.yml");
  if (!fs.existsSync(workflowPath)) {
    const workflowContent = `name: Jaxx Quality & Audit Gate

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci || npm install

      - name: Verify Quality, Audit Trail & Blast Radius
        run: npx jaxx verify
`;
    fs.writeFileSync(workflowPath, workflowContent, "utf8");
    return true;
  }
  return false;
}

function generateFrameConfig(projectName: string): string {
  // Generic defaults only. Every project-specific value belongs here, in the
  // consumer project — never inside the framework.
  return `import type { FrameConfig } from "@jaxx/core";

/**
 * Whitelabel configuration for ${projectName}.
 * Edit repos, docker containers, theme and quality thresholds to match
 * this project.
 */
const config = {
  project: {
    name: ${JSON.stringify(projectName)},
  },
  theme: {
    primaryColor: "#2563eb",
    borderRadius: "0.5rem",
  },
  repos: [
    {
      name: "main",
      path: ".",
      defaultBranch: "main",
    },
  ],
  docker: {
    containers: [],
  },
  ports: {
    dashboard: 3099,
  },
  quality: {
    enabled: true,
    maxComplexity: 10,
    maxDuplicationRatio: 0.05,
    exclude: ["**/*.test.ts", "**/*.spec.ts"],
  },
} satisfies FrameConfig;

export default config;
`;
}

function installGitIgnore(rootDir: string): boolean {
  const gitignorePath = path.join(rootDir, ".gitignore");
  const ignoreRules = `
# Agent Jaxx Model - Telemetry & Vectors
.agent/*.jsonl
.agent/cache/
.agent/vectors/
.agent/quality/
.agent/tmp/
.agent/sessions/
`;

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, ignoreRules, "utf8");
    return true;
  }

  const currentContent = fs.readFileSync(gitignorePath, "utf8");
  if (!currentContent.includes(".agent/*.jsonl")) {
    fs.appendFileSync(gitignorePath, "\n" + ignoreRules, "utf8");
    return true;
  }

  return false;
}
