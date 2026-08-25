/** Deterministic exit codes — documented contract for agents and CI. */
export const EXIT = {
  OK: 0,
  /** One or more checks failed (doctor, quality gate). */
  CHECK_FAILED: 1,
  /** Invalid usage / unknown command / bad arguments. */
  USAGE: 2,
  /** Configuration or control-plane integrity error. */
  CONFIG: 3,
  /** Unexpected internal error. */
  INTERNAL: 4,
} as const;

export interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: Record<string, string | boolean>;
}

/** Minimal dependency-free argv parser: supports --flag value and --bool. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (command == null) {
      command = a;
    } else {
      positional.push(a);
    }
  }
  return { command, positional, flags };
}

export function flagBool(args: ParsedArgs, name: string): boolean {
  return Boolean(args.flags[name]);
}

export function flagStr(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name];
  return typeof v === "string" ? v : undefined;
}
