import path from "node:path";
import { EVENT_LEVELS, findProjectRoot, logEvent, type EventLevel } from "@jaxx/core";

export function cmdLog(
  lvl: string,
  msg: string,
  agent: string | undefined,
  rootDir: string | undefined,
): void {
  if (!msg) throw new Error('log requires a message: jaxx log INFO "did something" --agent my-agent');
  if (!EVENT_LEVELS.includes(lvl as EventLevel)) {
    throw new Error(`invalid level "${lvl}". Valid levels: ${EVENT_LEVELS.join(", ")}`);
  }
  const resolvedAgent = agent ?? process.env.JAXX_AGENT ?? "default";
  const root = resolveRoot(rootDir);
  logEvent(root, lvl as EventLevel, msg, resolvedAgent);
}

/**
 * Explicit --root wins; otherwise walk up from cwd to find an existing
 * control plane so logging from a subdirectory never creates stray
 * .agent directories.
 */
export function resolveRoot(rootFlag?: string): string {
  if (rootFlag) return path.resolve(rootFlag);
  const cwd = process.cwd();
  return findProjectRoot(cwd) ?? cwd;
}
