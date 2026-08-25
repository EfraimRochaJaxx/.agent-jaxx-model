#!/usr/bin/env node
import path from "node:path";
import { EXIT, parseArgs, flagStr } from "./args";
import { cmdInit } from "./commands/init";
import { cmdLog, resolveRoot } from "./commands/log";
import { runDoctor, formatDoctorReport, type DoctorOptions } from "./commands/doctor";

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
  jaxx skill add <name>               Add a skill from a local markdown file or stdin template
  jaxx skill list [--json]            List installed skills
  jaxx skill install <repo-git>       Safely install skills from an external Git repository

Exit codes: 0 ok | 1 check failed | 2 usage error | 3 config error | 4 internal error`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const json = args.flags["json"] === true;
  try {
    switch (args.command) {
      case "init": {
        const name = args.positional[0];
        if (!name) {
          console.error('Usage: jaxx init "<project name>"');
          return EXIT.USAGE;
        }
        const root = resolveRoot(flagStr(args, "root"));
        const res = cmdInit(name, root);
        if (json) {
          console.log(JSON.stringify({ ok: true, root, ...res }, null, 2));
        } else {
          console.log(`Initialized control plane for "${name}" at ${path.join(root, ".agent")}`);
          for (const f of res.files) console.log(`  ${f}`);
          console.log(`  ${path.join(".agent", "frame.config.ts")}  <- edit repos/docker/theme/quality here`);
        }
        return EXIT.OK;
      }
      case "log": {
        const [lvl, msg] = args.positional;
        cmdLog(lvl ?? "", msg ?? "", flagStr(args, "agent"), flagStr(args, "root") ?? ".");
        if (json) console.log(JSON.stringify({ ok: true }));
        else console.log("logged.");
        return EXIT.OK;
      }
      case "doctor": {
        const opts: DoctorOptions = {
          quality: args.flags["quality"] === true,
          branchProtection: args.flags["branch-protection"] === true,
        };
        const report = await runDoctor(resolveRoot(flagStr(args, "root")), opts);
        if (json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatDoctorReport(report));
        }
        return report.ok ? EXIT.OK : EXIT.CHECK_FAILED;
      }
      case "skill":
      case "skills": {
        const { runSkill } = await import("./commands/skills");
        return await runSkill(args, json);
      }
      case "help":
      case "--help":
      case "-h":
      case null:
        console.log(USAGE);
        return args.command == null ? EXIT.USAGE : EXIT.OK;
      default:
        console.error(`Unknown command: ${args.command}\n`);
        console.log(USAGE);
        return EXIT.USAGE;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      console.log(JSON.stringify({ ok: false, error: message }));
    } else {
      console.error(`error: ${message}`);
    }
    if (/^Usage:|requires|invalid level|Unknown/.test(message)) return EXIT.USAGE;
    if (/Invalid frame config|No frame.config|control plane/i.test(message)) return EXIT.CONFIG;
    return EXIT.INTERNAL;
  }
}

main().then((code) => process.exit(code));
