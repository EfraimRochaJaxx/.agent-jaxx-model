import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { EXIT, flagBool, flagStr, type ParsedArgs } from "../args";
import { findProjectRoot, loadFrameConfig } from "@jaxx/core";
import { locate as locateBridge, probeHealthSync, spawnBridgeDetached } from "./bridge";

/**
 * Locate the built dashboard server script (@jaxx/dashboard/dist/server/server.js).
 * Supports both standalone npm installation and monorepo development.
 */
function locateDashboardServer(): string {
  try {
    const pkgJson = require.resolve("@jaxx/dashboard/package.json");
    const candidate = path.join(path.dirname(pkgJson), "dist", "server", "server.js");
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    /* fallback to local relative lookup */
  }

  const candidates = [
    path.resolve(__dirname, "..", "..", "dashboard", "dist", "server", "server.js"),
    path.resolve(__dirname, "..", "..", "..", "dashboard", "dist", "server", "server.js"),
    path.resolve(__dirname, "..", "..", "packages", "dashboard", "dist", "server", "server.js"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  throw new Error("dashboard server build not found — run `npm run build` in the framework or ensure @jaxx/dashboard is installed");
}

function resolveDashboardPort(root: string): number {
  try {
    return loadFrameConfig(root).ports.dashboard;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${msg}\nHint: run \`jaxx init\` in the target project first.`);
  }
}

function setupProcessCleanup(children: ChildProcess[]): () => void {
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
  return stopAll;
}

async function startBridgeService(
  args: ParsedArgs,
  dashboardPort: number,
  json: boolean,
): Promise<ChildProcess> {
  const loc = locateBridge({ ...args, positional: args.positional.filter((p) => p !== "serve") });
  const bridge = spawnBridgeDetached(loc);
  const up = await waitFor(() => probeHealthSync(loc.port, 1000), 10, 700);

  if (json) {
    console.log(JSON.stringify({ ok: true, dashboardPort, bridgePort: loc.port, bridgeReady: up }));
  } else {
    console.log(up ? `LangGraph bridge ready at http://127.0.0.1:${loc.port}` : "warning: bridge did not become ready in time");
  }
  return bridge;
}

/**
 * jaxx serve — start the control-center dashboard (and optionally the
 * LangGraph bridge) for the resolved project. Both children are stopped
 * when this process exits (Ctrl+C propagates).
 */

export async function runServe(args: ParsedArgs, json: boolean): Promise<number> {
  const root = path.resolve(flagStr(args, "root") ?? findProjectRoot() ?? process.cwd());
  const withBridge = flagBool(args, "with-bridge");

  let dashboardPort: number;
  try {
    dashboardPort = resolveDashboardPort(root);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`error: ${msg}`);
    return EXIT.CONFIG;
  }

  const serverJs = locateDashboardServer();
  const children: ChildProcess[] = [];
  const stopAll = setupProcessCleanup(children);

  const dashboard = spawn(process.execPath, [serverJs, "--root", root], {
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(dashboard);

  if (withBridge) {
    const bridge = await startBridgeService(args, dashboardPort, json);
    children.push(bridge);
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
