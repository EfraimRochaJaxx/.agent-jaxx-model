import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { FrameConfigSchema, type FrameConfig } from "./schemas";
import { AGENT_DIR_NAME } from "./paths";

/**
 * Loads frame.config.ts (or .js / .json) for a project.
 *
 * TRUST BOUNDARY: the frame config is part of the consumer's own repository
 * and is executed as local trusted configuration (same trust level as any
 * file in the repo). It is NEVER loaded from external/skill sources.
 */

export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  // Walk up until a directory containing .agent/frame.config.ts or frame.config.ts is found.
  for (;;) {
    if (
      fs.existsSync(path.join(dir, AGENT_DIR_NAME, "frame.config.ts")) ||
      fs.existsSync(path.join(dir, "frame.config.ts"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadConfigModule(configPath: string): unknown {
  const ext = path.extname(configPath);
  if (ext === ".json") {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  let source: string;
  if (ext === ".ts" || ext === ".mts") {
    const out = ts.transpileModule(fs.readFileSync(configPath, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    source = out.outputText;
  } else {
    source = fs.readFileSync(configPath, "utf8");
  }
  // Evaluate transpiled CJS in an isolated temp module.
  const tmpFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "jaxx-config-")),
    "frame.config.cjs",
  );
  try {
    fs.writeFileSync(tmpFile, source, "utf8");
    const mod = require(tmpFile);
    return mod.default ?? mod;
  } finally {
    try {
      delete require.cache[tmpFile];
      fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

export function locateFrameConfig(rootDir: string): string | null {
  const candidates = [
    path.join(rootDir, AGENT_DIR_NAME, "frame.config.ts"),
    path.join(rootDir, "frame.config.ts"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function loadFrameConfig(rootDir: string): FrameConfig {
  const configPath = locateFrameConfig(rootDir);
  if (!configPath) {
    throw new Error(`No frame.config.ts found under ${rootDir} (looked in ${AGENT_DIR_NAME}/ and project root)`);
  }
  return loadFrameConfigFromPath(configPath);
}

export function loadFrameConfigFromPath(configPath: string): FrameConfig {
  const raw = loadConfigModule(configPath);
  const result = FrameConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid frame config at ${configPath}:\n${result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  }
  return result.data;
}
