import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { EXIT, flagBool, flagStr, type ParsedArgs } from "../args";
import { findProjectRoot, loadFrameConfig } from "@jaxx/core";
import { locate as locateBridge, probeHealthSync, spawnBridgeDetached } from "./bridge";

/**
 * jaxx serve — start the control-center dashboard (and optionally the
 * LangGraph bridge) for the resolved project. Both children are stopped
 * when this process exits (Ctrl+C propagates).
 */

export async function runServe(args: ParsedArgs, json: boolean): Promise<number> {
  const root = path.resolve(flagStr(args, "root") ?? findProjectRoot() ?? process.cwd());
  const withBridge = flagBool(args, "with-bridge");

  let dashboardPort = 3099;
  try {
    dashboardPort = loadFrameConfig(root).ports.dashboard;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`error: ${msg}\nHint: run \`jaxx init\` in the target project first.`);
    return EXIT.CONFIG;
  }

  const serverJs = path.join(__dirname, "..", "..", "dashboard", "dist", "server", "server.js");
  if (!require("node:fs").existsSync(serverJs)) {
    throw new Error(`dashboard server build not found at ${serverJs} — run \`npm run build\` in the framework`);
  }

  const children: ChildProcess[] = [];
  const stopAll = (): void => {
    for (const c of children) {
      try {
        c.kill();
      } catch {
        /* best effort */
      }
    }
  };
  process.on("SIGINT", () => {
    stopAll();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    stopAll();
    process.exit(143);
  });

  const dashboard = spawn(process.execPath, [serverJs, "--root", root], {
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(dashboard);

  let bridge: ChildProcess | null = null;
  if (withBridge) {
    const loc = locateBridge({ ...args, positional: args.positional.filter((p) => p !== "serve") });
    bridge = spawnBridgeDetached(loc);
    children.push(bridge);
    // Wait briefly and report readiness.
    const up = await waitFor(() => probeHealthSync(loc.port, 1000), 10, 700);
    if (json) {
      console.log(JSON.stringify({ ok: true, dashboardPort, bridgePort: loc.port, bridgeReady: up }));
    } else {
      console.log(up ? `LangGraph bridge ready at http://127.0.0.1:${loc.port}` : "warning: bridge did not become ready in time");
    }
  }

  if (!json) {
    console.log(`Dashboard: http://localhost:${dashboardPort}  (Ctrl+C stops everything)`);
  }

  const code = await new Promise<number>((resolve) => {
    dashboard.on("exit", (c) => resolve(c ?? 0));
    dashboard.on("error", (e) => {
      console.error(`error: dashboard failed: ${e.message}`);
      resolve(EXIT.INTERNAL);
    });
  });
  stopAll();
  return code === 0 ? EXIT.OK : EXIT.INTERNAL;
}

async function waitFor(fn: () => boolean, attempts: number, delayMs: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return fn();
}
