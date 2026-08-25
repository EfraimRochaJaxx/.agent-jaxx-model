import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { EXIT, flagStr, type ParsedArgs } from "../args";
import { findProjectRoot, loadFrameConfig } from "@jaxx/core";

/**
 * jaxx bridge — manage the optional LangGraph bridge service.
 *
 * The bridge lives in the framework repository (packages/langgraph-bridge).
 * It is located relative to the CLI installation, overridable via --dir or
 * $JAXX_BRIDGE_DIR. The project root is resolved like every other command.
 */

const USAGE = `Usage:
  jaxx bridge start [--port N] [--root dir] [--dir path]   Start the LangGraph bridge (foreground)
  jaxx bridge status [--port N] [--root dir] [--dir path]  Check if the bridge is running (--json supported)

The bridge requires a prepared Python environment:
  cd <framework>/packages/langgraph-bridge
  python -m venv .venv
  .venv/bin/pip install -r requirements.txt   (Windows: .venv\\Scripts\\pip)`;

interface BridgeLocation {
  dir: string;
  python: string;
  root: string;
  port: number;
}

export function locate(args: ParsedArgs): BridgeLocation {  const root = path.resolve(flagStr(args, "root") ?? findProjectRoot() ?? process.cwd());
  const dir = path.resolve(
    flagStr(args, "dir") ?? process.env.JAXX_BRIDGE_DIR ?? path.join(__dirname, "..", "..", "..", "langgraph-bridge"),
  );
  const venvPython =
    process.platform === "win32"
      ? path.join(dir, ".venv", "Scripts", "python.exe")
      : path.join(dir, ".venv", "bin", "python");
  let port = 3100;
  try {
    port = loadFrameConfig(root).bridge.port;
  } catch {
    /* fall back to default port when the project has no frame config */
  }
  const portFlag = flagStr(args, "port");
  if (portFlag) port = Number(portFlag);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid bridge port: ${portFlag}`);
  }
  return { dir, python: venvPython, root, port };
}

function assertBridgeReady(loc: BridgeLocation): void {
  if (!fs.existsSync(path.join(loc.dir, "jaxx_bridge", "server.py"))) {
    throw new Error(`bridge not found at ${loc.dir} (use --dir or set JAXX_BRIDGE_DIR)`);
  }
  if (!fs.existsSync(loc.python)) {
    throw new Error(
      `python venv not prepared. Run:\n  cd ${loc.dir}\n  python -m venv .venv\n  .venv\\Scripts\\pip install -r requirements.txt`,
    );
  }
}

export async function runBridge(args: ParsedArgs, json: boolean): Promise<number> {
  const sub = args.positional[0];
  try {
    switch (sub) {
      case "start":
        return await bridgeStart(args, json);
      case "status":
        return await bridgeStatus(args, json);
      default:
        console.log(USAGE);
        return sub == null ? EXIT.USAGE : EXIT.USAGE;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`error: ${msg}`);
    return EXIT.CONFIG;
  }
}

async function bridgeStart(args: ParsedArgs, json: boolean): Promise<number> {
  const loc = locate(args);
  assertBridgeReady(loc);
  const uvicornArgs = ["-m", "uvicorn", "jaxx_bridge.server:app", "--host", "127.0.0.1", "--port", String(loc.port)];
  if (json) console.log(JSON.stringify({ ok: true, starting: true, port: loc.port, root: loc.root }));
  else {
    console.log(`Starting LangGraph bridge for ${loc.root}`);
    console.log(`  http://127.0.0.1:${loc.port}  (Ctrl+C to stop)`);
  }
  const child = spawn(loc.python, uvicornArgs, {
    cwd: loc.dir,
    env: { ...process.env, JAXX_ROOT: loc.root },
    stdio: "inherit",
    windowsHide: true,
  });
  const code = await new Promise<number>((resolve) => {
    child.on("exit", (c) => resolve(c ?? EXIT.INTERNAL));
    child.on("error", (e) => {
      console.error(`error: failed to launch bridge: ${e.message}`);
      resolve(EXIT.INTERNAL);
    });
  });
  return code === 0 ? EXIT.OK : EXIT.INTERNAL;
}

async function bridgeStatus(args: ParsedArgs, json: boolean): Promise<number> {
  const loc = locate(args);
  const running = await probeHealth(loc.port);
  if (json) {
    console.log(JSON.stringify({ ok: running, running, port: loc.port }));
  } else {
    console.log(running ? `bridge running at http://127.0.0.1:${loc.port}` : `bridge NOT running on port ${loc.port}`);
  }
  return running ? EXIT.OK : EXIT.CHECK_FAILED;
}

/** GET /health with a short timeout; resolves false on any failure. */
export function probeHealth(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/health", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

/** Used by `jaxx serve --with-bridge`: fire-and-forget background start. */
export function spawnBridgeDetached(loc: BridgeLocation): ReturnType<typeof spawn> {
  assertBridgeReady(loc);
  return spawn(
    loc.python,
    ["-m", "uvicorn", "jaxx_bridge.server:app", "--host", "127.0.0.1", "--port", String(loc.port)],
    {
      cwd: loc.dir,
      env: { ...process.env, JAXX_ROOT: loc.root },
      stdio: "ignore",
      windowsHide: true,
      detached: false,
    },
  );
}

/** Sync probe helper for the serve launcher (best effort). */
export function probeHealthSync(port: number, timeoutMs = 1500): boolean {
  try {
    const r = spawnSync(
      process.execPath,
      ["-e", `fetch('http://127.0.0.1:${port}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`],
      { timeout: timeoutMs, windowsHide: true },
    );
    return r.status === 0;
  } catch {
    return false;
  }
}
