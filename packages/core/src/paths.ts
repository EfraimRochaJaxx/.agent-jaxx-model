import path from "node:path";

/** Directory name of the control plane inside a consumer project. */
export const AGENT_DIR_NAME = ".agent";

export const CONTROL_PLANE_FILES = [
  "STATE.md",
  "PLAN.md",
  "PROGRESS.md",
  "DECISIONS.md",
  "VERIFICATION.md",
  "BRANCHING.md",
  "COLLABORATION.md",
  "AGENT_LOG.jsonl",
] as const;

export const SKILLS_DIR_NAME = "skills";
export const FRAME_CONFIG_FILENAME = "frame.config.ts";

export function agentDir(rootDir: string): string {
  return path.join(rootDir, AGENT_DIR_NAME);
}

export function agentFile(rootDir: string, file: string): string {
  if (!(CONTROL_PLANE_FILES as readonly string[]).includes(file)) {
    throw new Error(`Not a control-plane file: ${file}`);
  }
  return path.join(agentDir(rootDir), file);
}

export function skillsDir(rootDir: string): string {
  return path.join(agentDir(rootDir), SKILLS_DIR_NAME);
}
