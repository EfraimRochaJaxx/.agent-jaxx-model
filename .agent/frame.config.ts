import type { FrameConfig } from "@jaxx/core";

/**
 * Whitelabel configuration for Agent Jaxx Model.
 * Edit repos, docker containers, theme and quality thresholds to match
 * this project.
 */
const config = {
  project: {
    name: "Agent Jaxx Model",
  },
  theme: {
    // JaxxSystems official palette (jaxx-ip/10-assets/paleta.md v1.0.0):
    // Quantum Teal accent on Deep Obsidian dark surfaces.
    primaryColor: "#00FFD1",
    backgroundColor: "#0A0B0D",
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
