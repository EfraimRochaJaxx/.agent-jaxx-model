import fs from "node:fs";
import path from "node:path";
import {
  appendEvent,
  getRepoStatus,
  locateFrameConfig,
  loadFrameConfig,
  type FrameConfig,
} from "@jaxx/core";
import { EXIT, type ParsedArgs } from "../args";

export interface RepoEntry {
  name: string;
  path: string;
  defaultBranch?: string;
}

export async function runRepo(
  args: ParsedArgs,
  rootDir: string,
  json: boolean,
): Promise<number> {
  const sub = args.positional[0] ?? "list";
  switch (sub) {
    case "list":
      return handleList(rootDir, json);
    case "add":
      return handleAdd(args, rootDir, json);
    case "remove":
    case "rm":
      return handleRemove(args, rootDir, json);
    default:
      throw new Error(
        `Unknown repo subcommand: ${sub}\nUsage: jaxx repo [list|add|remove]`,
      );
  }
}

function handleList(rootDir: string, json: boolean): number {
  const config = loadFrameConfig(rootDir);
  const repos = config.repos.map((r) => {
    const absPath = path.resolve(rootDir, r.path);
    const exists = fs.existsSync(absPath);
    const git = exists ? getRepoStatus(absPath) : null;
    return {
      name: r.name,
      path: r.path,
      exists,
      isRepo: git?.isRepo ?? false,
      branch: git?.branch,
      dirty: git?.dirty,
    };
  });

  if (json) {
    console.log(JSON.stringify({ ok: true, root: rootDir, repos }, null, 2));
    return EXIT.OK;
  }

  if (repos.length === 0) {
    console.log("No repositories linked in frame.config.ts.");
    return EXIT.OK;
  }

  console.log(`Configured repositories (${repos.length}):`);
  for (const r of repos) {
    const status = !r.exists
      ? "[missing directory]"
      : !r.isRepo
        ? "[not a git repo]"
        : `[branch: ${r.branch ?? "unknown"}${r.dirty ? ", modified" : ", clean"}]`;
    console.log(`  - ${r.name} (path: ${r.path}) ${status}`);
  }
  return EXIT.OK;
}

function handleAdd(args: ParsedArgs, rootDir: string, json: boolean): number {
  const name = args.positional[1];
  const targetPath = args.positional[2];

  if (!name || !targetPath) {
    throw new Error('Usage: jaxx repo add <name> <path>\nExample: jaxx repo add backend ../api');
  }

  const configPath = locateFrameConfig(rootDir);
  if (!configPath) {
    throw new Error(`No frame.config.ts found in ${rootDir}`);
  }

  const config = loadFrameConfig(rootDir);
  if (config.repos.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Repository with name "${name}" is already configured`);
  }

  const absTarget = path.resolve(process.cwd(), targetPath);
  const relPath = normalizeRelativePath(path.relative(rootDir, absTarget));
  const gitStatus = fs.existsSync(absTarget) ? getRepoStatus(absTarget) : null;

  const entry: RepoEntry = {
    name,
    path: relPath || ".",
    defaultBranch: gitStatus?.branch ?? "main",
  };

  const source = fs.readFileSync(configPath, "utf8");
  const updatedSource = insertRepoIntoSource(source, entry);
  fs.writeFileSync(configPath, updatedSource, "utf8");

  appendEvent(rootDir, {
    lvl: "INFO",
    agent: "jaxx-cli",
    msg: `Linked repository "${name}" at "${relPath}"`,
  });

  if (json) {
    console.log(JSON.stringify({ ok: true, added: entry, configPath }, null, 2));
  } else {
    console.log(`✓ Linked repository "${name}" (${relPath}) to ${config.project.name} control plane.`);
  }
  return EXIT.OK;
}

function handleRemove(args: ParsedArgs, rootDir: string, json: boolean): number {
  const name = args.positional[1];
  if (!name) {
    throw new Error("Usage: jaxx repo remove <name>");
  }

  const configPath = locateFrameConfig(rootDir);
  if (!configPath) {
    throw new Error(`No frame.config.ts found in ${rootDir}`);
  }

  const config = loadFrameConfig(rootDir);
  const exists = config.repos.some((r) => r.name.toLowerCase() === name.toLowerCase());
  if (!exists) {
    throw new Error(`Repository "${name}" not found in frame.config.ts`);
  }

  const source = fs.readFileSync(configPath, "utf8");
  const updatedSource = removeRepoFromSource(source, name);
  fs.writeFileSync(configPath, updatedSource, "utf8");

  appendEvent(rootDir, {
    lvl: "INFO",
    agent: "jaxx-cli",
    msg: `Unlinked repository "${name}"`,
  });

  if (json) {
    console.log(JSON.stringify({ ok: true, removed: name }, null, 2));
  } else {
    console.log(`✓ Removed repository "${name}" from ${config.project.name} control plane.`);
  }
  return EXIT.OK;
}

export function insertRepoIntoSource(source: string, entry: RepoEntry): string {
  const entryStr = `    {\n      name: ${JSON.stringify(entry.name)},\n      path: ${JSON.stringify(entry.path)},\n      defaultBranch: ${JSON.stringify(entry.defaultBranch ?? "main")},\n    },`;

  // Case 1: Empty repos array `repos: []`
  if (/repos\s*:\s*\[\s*\]/.test(source)) {
    return source.replace(/repos\s*:\s*\[\s*\]/, `repos: [\n${entryStr}\n  ]`);
  }

  // Case 2: Array with existing items
  const match = source.match(/repos\s*:\s*\[/);
  if (match && match.index != null) {
    const insertPos = match.index + match[0].length;
    return (
      source.slice(0, insertPos) +
      "\n" +
      entryStr +
      source.slice(insertPos)
    );
  }

  // Fallback: append repos block before last closing brace
  const lastBrace = source.lastIndexOf("}");
  if (lastBrace !== -1) {
    return (
      source.slice(0, lastBrace) +
      `  repos: [\n${entryStr}\n  ],\n` +
      source.slice(lastBrace)
    );
  }
  return source;
}

export function removeRepoFromSource(source: string, name: string): string {
  const regex = new RegExp(
    `\\s*\\{[^}]*name\\s*:\\s*["']${escapeRegex(name)}["'][^}]*\\},?`,
    "g",
  );
  return source.replace(regex, "");
}

function normalizeRelativePath(rel: string): string {
  return rel.replace(/\\/g, "/");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
