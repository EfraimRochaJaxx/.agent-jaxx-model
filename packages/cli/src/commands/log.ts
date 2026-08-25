import path from "node:path";
import { EVENT_LEVELS, logEvent, type EventLevel } from "@jaxx/core";

export function cmdLog(
  lvl: string,
  msg: string,
  agent: string | undefined,
  rootDir: string,
): void {
  if (!msg) throw new Error('log requires a message: jaxx log INFO "did something" --agent my-agent');
  if (!EVENT_LEVELS.includes(lvl as EventLevel)) {
    throw new Error(`invalid level "${lvl}". Valid levels: ${EVENT_LEVELS.join(", ")}`);
  }
  const resolvedAgent = agent ?? process.env.JAXX_AGENT ?? "default";
  const root = resolveRoot(rootDir);
  logEvent(root, lvl as EventLevel, msg, resolvedAgent);
}

export function resolveRoot(rootFlag?: string): string {
  return path.resolve(rootFlag ?? ".");
}
