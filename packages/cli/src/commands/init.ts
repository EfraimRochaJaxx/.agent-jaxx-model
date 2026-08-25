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
  const files = fs
    .readdirSync(agentDir)
    .map((f) => path.join(".agent", f))
    .sort();
  return { files, configPath };
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
