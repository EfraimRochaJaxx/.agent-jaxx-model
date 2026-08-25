import fs from "node:fs";
import path from "node:path";
import { EventSchema, parseEvent, type Event, type EventLevel } from "./schemas";
import { acquireLock, releaseLock } from "./lock";
import { agentFile } from "./paths";

/**
 * Append-only audit log (AGENT_LOG.jsonl).
 *
 * Guarantees:
 * - Writes are validated against the Event schema before hitting disk.
 * - Writers serialize through an advisory file lock (concurrent-safe).
 * - Reads are tolerant: malformed lines are skipped and reported, never
 *   deleted or rewritten. Historical data is never silently destroyed.
 */

export function agentLogPath(rootDir: string): string {
  return agentFile(rootDir, "AGENT_LOG.jsonl");
}

export interface AppendResult {
  event: Event;
}

export function appendEvent(rootDir: string, input: Omit<Event, "ts"> & { ts?: string }): AppendResult {
  const event: Event = EventSchema.parse({
    ...input,
    ts: input.ts ?? new Date().toISOString(),
  });
  const logPath = agentLogPath(rootDir);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const line = JSON.stringify(event) + "\n";
  const lockPath = `${logPath}.lock`;
  acquireLock(lockPath);
  try {
    fs.appendFileSync(logPath, line, "utf8");
  } finally {
    releaseLock(lockPath);
  }
  return { event };
}

export interface ReadEventsResult {
  events: Event[];
  totalLines: number;
  malformedLines: number[];
}

/** Tolerant read. Malformed lines are skipped but their indices are reported. */
export function readEvents(rootDir: string, limit?: number): ReadEventsResult {
  const logPath = agentLogPath(rootDir);
  return readEventsFrom(logPath, limit);
}

export function readEventsFrom(logPath: string, limit?: number): ReadEventsResult {
  const events: Event[] = [];
  const malformedLines: number[] = [];
  let totalLines = 0;
  let raw: string;
  try {
    raw = fs.readFileSync(logPath, "utf8");
  } catch {
    return { events, totalLines: 0, malformedLines };
  }
  const lines = raw.split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    totalLines++;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      malformedLines.push(i);
      return;
    }
    const ev = parseEvent(parsed);
    if (!ev) {
      malformedLines.push(i);
      return;
    }
    events.push(ev);
  });
  return {
    events: limit != null ? events.slice(-limit) : events,
    totalLines,
    malformedLines,
  };
}

/** Integrity report used by `jaxx doctor`. Never mutates the log. */
export interface LogIntegrity {
  exists: boolean;
  appendOnlyViolation: null | string;
  valid: number;
  malformed: number;
  firstTs?: string;
  lastTs?: string;
}

export function checkLogIntegrity(rootDir: string): LogIntegrity {
  const logPath = agentLogPath(rootDir);
  const { events, totalLines, malformedLines } = readEventsFrom(logPath);
  const integrity: LogIntegrity = {
    exists: fs.existsSync(logPath),
    appendOnlyViolation: null,
    valid: events.length,
    malformed: malformedLines.length,
  };
  if (events.length > 0) {
    integrity.firstTs = events[0].ts;
    integrity.lastTs = events[events.length - 1].ts;
  }
  void totalLines;
  // Timestamp monotonicity check (soft signal — out-of-order ts from
  // different machines are possible; we only flag clearly regressive runs).
  for (let i = 1; i < events.length; i++) {
    if (new Date(events[i].ts).getTime() < new Date(events[i - 1].ts).getTime() - 1000 * 60 * 60 * 24) {
      integrity.appendOnlyViolation = `timestamp regression at logical line ${i}`;
      break;
    }
  }
  return integrity;
}

/** Convenience helper matching the CLI surface: level + message + agent. */
export function logEvent(
  rootDir: string,
  lvl: EventLevel,
  msg: string,
  agent = "default",
): AppendResult {
  return appendEvent(rootDir, { lvl, msg, agent });
}
