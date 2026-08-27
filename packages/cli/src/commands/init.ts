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
  // Install pre-commit & pre-push hooks if git exists
  installGitHooks(rootDir);
  // Install automated GitHub Actions workflow
  installGitHubWorkflow(rootDir);

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
