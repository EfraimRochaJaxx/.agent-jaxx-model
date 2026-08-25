#!/usr/bin/env node
import path from "node:path";
import { EXIT, parseArgs, flagStr, type ParsedArgs } from "./args";
import { cmdLog } from "./commands/log";

const USAGE = `jaxx — Agent Jaxx Model CLI

Usage:
  jaxx init "<project name>"          Initialize .agent control plane in the current project
  jaxx log <LVL> "<msg>"              Append an event to AGENT_LOG.jsonl
      --agent <name>                  Agent identity (default: $JAXX_AGENT or "default")
      --root <dir>                    Project root (default: cwd)
  jaxx doctor                         Run environment/config/control-plane checks
      --quality                       Include quality-gate analysis
      --json                          Machine-readable output
      --branch-protection             Probe GitHub branch protection (requires gh CLI)
  jaxx session open|close             Managed work sessions; close appends a summary to VERIFICATION.md
  jaxx skill add <name>               Add a skill from a template
  jaxx skill list [--json]            List installed skills
  jaxx skill install <repo-git>       Safely install skills from an external Git repository

Exit codes: 0 ok | 1 check failed | 2 usage error | 3 config error | 4 internal error`;

interface CliContext {
  args: ParsedArgs;
  json: boolean;
}

type Handler = (ctx: CliContext) => Promise<number> | number;

const COMMANDS: Record<string, Handler> = {
  init: handleInit,
  log: handleLog,
  doctor: handleDoctor,
  session: handleSession,
  skill: handleSkill,
  skills: handleSkill,
  help: () => (console.log(USAGE), EXIT.OK),
};

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const ctx: CliContext = { args, json: args.flags["json"] === true };

  if (args.command == null || args.command === "--help" || args.command === "-h") {
    if (args.flags["version"] === true) {
      const { version } = require("../package.json") as { version: string };
      console.log(version);
      return EXIT.OK;
    }
    console.log(USAGE);
    return args.command == null ? EXIT.USAGE : EXIT.OK;
  }
  if (args.command === "version") {
    const { version } = require("../package.json") as { version: string };
    console.log(version);
    return EXIT.OK;
  }
  const handler = COMMANDS[args.command];
  if (!handler) {
    console.error(`Unknown command: ${args.command}\n`);
    console.log(USAGE);
    return EXIT.USAGE;
  }
  try {
    return await handler(ctx);
  } catch (err) {
    return reportError(err, ctx.json);
  }
}

function reportError(err: unknown, json: boolean): number {
  const message = err instanceof Error ? err.message : String(err);
  if (json) console.log(JSON.stringify({ ok: false, error: message }));
  else console.error(`error: ${message}`);
  if (/^Usage:|requires|invalid level|refusing/i.test(message)) return EXIT.USAGE;
  if (/Invalid frame config|No frame.config/i.test(message)) return EXIT.CONFIG;
  return EXIT.INTERNAL;
}

async function handleInit({ args, json }: CliContext): Promise<number> {
  const name = args.positional[0];
  if (!name) throw new Error('Usage: jaxx init "<project name>"');
  const { cmdInit } = await import("./commands/init");
  const root = resolveRoot(args);
  const res = cmdInit(name, root);
  if (json) console.log(JSON.stringify({ ok: true, root, ...res }, null, 2));
  else {
    console.log(`Initialized control plane for "${name}" at ${path.join(root, ".agent")}`);
    for (const f of res.files) console.log(`  ${f}`);
    console.log(`  ${path.join(".agent", "frame.config.ts")}  <- edit repos/docker/theme/quality here`);
  }
  return EXIT.OK;
}

function handleLog({ args, json }: CliContext): number {
  const [lvl, msg] = args.positional;
  cmdLog(lvl ?? "", msg ?? "", flagStr(args, "agent"), flagStr(args, "root") ?? ".");
  if (json) console.log(JSON.stringify({ ok: true }));
  else console.log("logged.");
  return EXIT.OK;
}

async function handleDoctor({ args, json }: CliContext): Promise<number> {
  const { runDoctor, formatDoctorReport } = await import("./commands/doctor");
  const opts = {
    quality: args.flags["quality"] === true,
    branchProtection: args.flags["branch-protection"] === true,
  };
  const report = await runDoctor(resolveRoot(args), opts);
  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatDoctorReport(report));
  return report.ok ? EXIT.OK : EXIT.CHECK_FAILED;
}

async function handleSession(ctx: CliContext): Promise<number> {
  const { runSession } = await import("./commands/session");
  return runSession(ctx.args, ctx.json);
}

async function handleSkill(ctx: CliContext): Promise<number> {
  const { runSkill } = await import("./commands/skills");
  return runSkill(ctx.args, ctx.json);
}

function resolveRoot(args: ParsedArgs): string {
  return path.resolve(flagStr(args, "root") ?? ".");
}

main().then((code) => process.exit(code));
