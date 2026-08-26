import fs from "node:fs";
import path from "node:path";
import { appendEvent, readEvents } from "./log";
import type { Event, EventLevel } from "./schemas";

/**
 * Session lifecycle: open -> events[] -> close.
 * Closing generates an automatic summary suitable for VERIFICATION.md.
 */

const SESSION_ID_PREFIX = "session-";

export interface SessionSummary {
  sessionId: string;
  agent: string;
  startedAt: string;
  closedAt: string;
  counts: Record<string, number>;
  events: Event[];
  markdown: string;
}

export class Session {
  public readonly sessionId: string;
  private readonly events: Event[] = [];
  private readonly startedAt = new Date();

  constructor(
    private readonly rootDir: string,
    public readonly agent: string,
  ) {
    this.sessionId = `${SESSION_ID_PREFIX}${this.startedAt.toISOString().replace(/[:.]/g, "-")}`;
  }

  open(): this {
    appendEvent(this.rootDir, {
      lvl: "AGENT",
      agent: this.agent,
      msg: `Session opened (${this.sessionId})`,
    });
    return this;
  }

  record(lvl: EventLevel, msg: string): Event {
    const { event } = appendEvent(this.rootDir, { lvl, msg, agent: this.agent });
    this.events.push(event);
    return event;
  }

  close(summaryNote?: string): SessionSummary {
    const closedAt = new Date();
    const counts: Record<string, number> = {};
    for (const ev of this.events) counts[ev.lvl] = (counts[ev.lvl] ?? 0) + 1;

    appendEvent(this.rootDir, {
      lvl: "DONE",
      agent: this.agent,
      msg: summaryNote
        ? `Session closed (${this.sessionId}): ${summaryNote}`
        : `Session closed (${this.sessionId}) — ${this.events.length} event(s) recorded`,
    });

    const durationMin = ((closedAt.getTime() - this.startedAt.getTime()) / 60000).toFixed(1);
    const lines = [
      `## Session ${this.sessionId}`,
      "",
      `- **Agent:** ${this.agent}`,
      `- **Started:** ${this.startedAt.toISOString()}`,
      `- **Closed:** ${closedAt.toISOString()}`,
      `- **Duration:** ${durationMin} min`,
      `- **Events:** ${this.events.length} (${Object.entries(counts)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ") || "none"})`,
    ];
    if (summaryNote) lines.push("", `### Outcome`, "", summaryNote);
    if (this.events.length > 0) {
      lines.push("", "### Activity", "");
      for (const ev of this.events.slice(-50)) {
        lines.push(`- \`${ev.ts}\` [${ev.lvl}] ${ev.msg}`);
      }
    }
    lines.push("", "---", "");

    const markdown = lines.join("\n");
    return {
      sessionId: this.sessionId,
      agent: this.agent,
      startedAt: this.startedAt.toISOString(),
      closedAt: closedAt.toISOString(),
      counts,
      events: [...this.events],
      markdown,
    };
  }

  /** Append the session summary to VERIFICATION.md (called by CLI `session close`). */
  writeVerification(summary: SessionSummary): string {
    const verificationPath = path.join(this.rootDir, ".agent", "VERIFICATION.md");
    fs.mkdirSync(path.dirname(verificationPath), { recursive: true });
    fs.appendFileSync(verificationPath, summary.markdown, "utf8");
    return verificationPath;
  }
}

/** Read recent events across all agents (for dashboards / handoff). */
export function recentEvents(rootDir: string, limit = 100): Event[] {
  return readEvents(rootDir, limit).events;
}
