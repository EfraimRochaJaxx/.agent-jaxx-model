import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  getRepoStatus,
  listSkills,
  loadFrameConfig,
  readEventsFrom,
  type FrameConfig,
} from "@jaxx/core";

/**
 * Whitelabel control-center server. Native node:http only.
 * Serves the built React dashboard (dist/web) and a small JSON API that
 * reads the control plane of the project root (resolved via --root, $JAXX_ROOT
 * or cwd). Zero hardcoded project assumptions — everything comes from
 * .agent/frame.config.ts.
 */

function resolveRoot(): string {
  const argIdx = process.argv.indexOf("--root");
  if (argIdx !== -1 && process.argv[argIdx + 1]) return path.resolve(process.argv[argIdx + 1]);
  if (process.env.JAXX_ROOT) return path.resolve(process.env.JAXX_ROOT);
  return process.cwd();
}

function resolveWebDir(): string {
  // dist/server/server.js -> ../web
  const candidate = path.resolve(__dirname, "..", "web");
  if (fs.existsSync(candidate)) return candidate;
  // Fallback for source runs (tsx / ts-node): packages/dashboard/dist/web
  return path.resolve(__dirname, "..", "..", "dashboard", "dist", "web");
}

const ROOT = resolveRoot();
const WEB_DIR = resolveWebDir();

let CONFIG: FrameConfig;
try {
  CONFIG = loadFrameConfig(ROOT);
} catch (err) {
  console.error("fatal:", err instanceof Error ? err.message : err);
  console.error("Hint: run `jaxx init` in the target project first.");
  process.exit(3);
}
const PORT = CONFIG.ports.dashboard;

// ---- safe exec helpers -------------------------------------------------

import { spawnSync } from "node:child_process";

function run(cmd: string, args: string[], cwd?: string): string | null {
  try {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 10_000, windowsHide: true, shell: false });
    if (r.error || r.status !== 0) return null;
    return r.stdout.trim();
  } catch {
    return null;
  }
}

// ---- API ----------------------------------------------------------------

function dockerStatus(): { available: boolean; containers: { name: string; configured: boolean; running: boolean; status?: string }[] } {
  const raw = run("docker", ["ps", "--format", "{{.Names}}\t{{.Status}}"]);
  const available = raw != null || run("docker", ["--version"]) != null;
  const running = new Map<string, string>();
  if (raw) {
    for (const line of raw.split("\n")) {
      const [name, ...rest] = line.split("\t");
      if (name) running.set(name, rest.join("\t"));
    }
  }
  return {
    available,
    containers: CONFIG.docker.containers.map((name) => ({
      name,
      configured: true,
      running: running.has(name),
      status: running.get(name),
    })),
  };
}

function reposStatus() {
  return CONFIG.repos.map((repo) => ({
    name: repo.name,
    ...getRepoStatus(path.resolve(ROOT, repo.path)),
  }));
}

function agentLog(limit = 100) {
  const res = readEventsFrom(path.join(ROOT, ".agent", "AGENT_LOG.jsonl"), limit);
  return { events: res.events.slice().reverse(), malformedLines: res.malformedLines.length };
}

function skills() {
  const { skills, issues } = listSkills(ROOT);
  return {
    skills: skills.map((s) => ({ ...s.frontmatter, file: path.basename(s.filePath) })),
    issues,
  };
}

/** Quality scorecard written by @jaxx/analyzers into .agent/quality/latest.json */
function quality(): unknown {
  const p = path.join(ROOT, ".agent", "quality", "latest.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { exists: false };
  }
}

/** Serve the configured logo, but ONLY from inside the project root. */
function logoResponse(res: http.ServerResponse): boolean {
  const logoPath = CONFIG.project.logoPath;
  if (!logoPath) return false;
  const abs = path.resolve(ROOT, logoPath);
  if (!abs.startsWith(path.resolve(ROOT) + path.sep)) return false;
  try {
    const st = fs.lstatSync(abs); // lstat: refuse symlinked logos
    if (!st.isFile()) return false;
  } catch {
    return false;
  }
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === ".svg" ? "image/svg+xml" :
    ext === ".png" ? "image/png" :
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
    ext === ".ico" ? "image/x-icon" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  fs.createReadStream(abs).pipe(res);
  return true;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0];

  if (!["GET", "HEAD"].includes(req.method ?? "")) {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  if (url === "/api/logo") {
    if (!logoResponse(res)) sendJson(res, 404, { error: "no logo configured" });
    return;
  }

  switch (url) {
    case "/api/all":
      sendJson(res, 200, {
        ts: new Date().toISOString(),
        project: {
          name: CONFIG.project.name,
          logoUrl: CONFIG.project.logoPath ? "/api/logo" : null,
        },
        theme: CONFIG.theme,
        tokenCountdown: CONFIG.tokenCountdown,
        repos: reposStatus(),
        docker: dockerStatus(),
        agentLog: agentLog(),
        skills: skills(),
        quality: quality(),
      });
      return;
    case "/api/ping":
      sendJson(res, 200, { ok: true, ts: new Date().toISOString() });
      return;
    default:
      break;
  }

  // Static files (built SPA), restricted to WEB_DIR.
  let rel = url === "/" ? "/index.html" : url;
  const filePath = path.resolve(WEB_DIR, "." + rel);
  if (!filePath.startsWith(WEB_DIR + path.sep) && filePath !== WEB_DIR) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(WEB_DIR, "index.html"), (err2, index) => {
        if (err2) {
          sendJson(res, 404, {
            error: "dashboard web build not found — run `npm run build` in @jaxx/dashboard",
          });
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(index);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Control Center for "${CONFIG.project.name}" at http://localhost:${PORT}`);
  console.log(`Project root: ${ROOT}`);
});
