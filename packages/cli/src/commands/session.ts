import fs from "node:fs";
import path from "node:path";
import { EXIT, flagStr, type ParsedArgs } from "../args";
import { Session, appendEvent, findProjectRoot, readEvents } from "@jaxx/core";

const SESSION_FILE = ".agent.session.json";

interface SessionStateFile {
  id: string;
  agent: string;
  startedAt: string;
}

export function runSession(args: ParsedArgs, json: boolean): number {
  const sub = args.positional[0];
  const root = path.resolve(flagStr(args, "root") ?? findProjectRoot() ?? ".");
  const stateFile = path.join(root, SESSION_FILE);

  try {
    switch (sub) {
      case "open":
        return openSession(root, stateFile, args, json);
      case "close":
        return closeSession(root, stateFile, args, json);
      default:
        console.error('Usage: jaxx session <open|close> [--agent name] [--summary "outcome"] [extra notes...]');
        return EXIT.USAGE;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`error: ${msg}`);
    return EXIT.INTERNAL;
  }
}

function openSession(root: string, stateFile: string, args: ParsedArgs, json: boolean): number {
  if (fs.existsSync(stateFile)) {
    throw new Error("a session is already open — close it first (jaxx session close)");
  }
  const agent = flagStr(args, "agent") ?? process.env.JAXX_AGENT ?? "default";
  const session = new Session(root, agent).open();
  const state: SessionStateFile = {
    id: session.sessionId,
    agent,
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
  if (json) console.log(JSON.stringify({ ok: true, ...state }));
  else console.log(`Session ${session.sessionId} opened for "${agent}".`);
  return EXIT.OK;
}

function closeSession(root: string, stateFile: string, args: ParsedArgs, json: boolean): number {
  if (!fs.existsSync(stateFile)) {
    throw new Error("no open session in this project");
  }
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8")) as SessionStateFile;
  const closedAt = new Date();

  // Rebuild activity from the durable log (not memory) so the summary is
  // complete even across process boundaries.
  const events = readEvents(root).events.filter(
    (e) => e.agent === state.agent && new Date(e.ts) >= new Date(state.startedAt),
  );

  appendEvent(root, {
    lvl: "DONE",
    agent: state.agent,
    msg: `Session closed (${state.id}) — ${events.length} event(s) recorded`,
  });

  const verificationPath = renderSummary(root, state, events, closedAt, args);
  fs.rmSync(stateFile, { force: true });

  if (json) console.log(JSON.stringify({ ok: true, sessionId: state.id, verificationPath }));
  else console.log(`Session closed. Summary appended to ${verificationPath}`);
  return EXIT.OK;
}

function renderSummary(
  root: string,
  state: SessionStateFile,
  events: ReturnType<typeof readEvents>["events"],
  closedAt: Date,
  args: ParsedArgs,
): string {
  const counts = countLevels(events);
  const durationMin = ((closedAt.getTime() - new Date(state.startedAt).getTime()) / 60000).toFixed(1);
  const lines = [
    `## Session ${state.id}`,
    "",
    `- **Agent:** ${state.agent}`,
    `- **Started:** ${state.startedAt}`,
    `- **Closed:** ${closedAt.toISOString()}`,
    `- **Duration:** ${durationMin} min`,
    `- **Events:** ${events.length} (${formatCounts(counts)})`,
    ...outcomeLines(args),
    ...activityLines(events),
    "",
    "---",
    "",
  ];
  const verificationPath = path.join(root, ".agent", "VERIFICATION.md");
  fs.appendFileSync(verificationPath, lines.join("\n"), "utf8");
  return verificationPath;
}

type EventList = ReturnType<typeof readEvents>["events"];

function countLevels(events: EventList): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.lvl] = (counts[e.lvl] ?? 0) + 1;
  return counts;
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(", ") || "none";
}

function outcomeLines(args: ParsedArgs): string[] {
  const summaryNote = flagStr(args, "summary");
  const extraNotes = args.positional.slice(1);
  if (!summaryNote && extraNotes.length === 0) return [];
  return ["", "### Outcome", "", ...(summaryNote ? [summaryNote] : []), ...extraNotes.map((n) => `- ${n}`)];
}

function activityLines(events: EventList): string[] {
  if (events.length === 0) return [];
  return ["", "### Activity", "", ...events.slice(-50).map((e) => `- \`${e.ts}\` [${e.lvl}] ${e.msg}`)];
}
