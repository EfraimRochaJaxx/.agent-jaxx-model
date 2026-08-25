import type { FrameConfig } from "./packages/core/src/schemas";

/**
 * Example whitelabel configuration.
 * Copy to `.agent/frame.config.ts` (or project root) inside your project
 * and adapt every value. Nothing here is a framework default.
 */
const config = {
  project: {
    name: "My Project",
    logoPath: undefined as string | undefined,
  },
  theme: {
    primaryColor: "#2563eb",
    borderRadius: "0.5rem",
  },
  repos: [
    {
      name: "app",
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
    exclude: ["**/*.test.ts"],
  },
} satisfies FrameConfig;

export default config;
