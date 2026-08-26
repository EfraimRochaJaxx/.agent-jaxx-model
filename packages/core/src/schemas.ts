import { z } from "zod";

/** Severity levels for control-plane events. */
export const EVENT_LEVELS = ["INFO", "WARN", "ERROR", "DONE", "AGENT", "GIT"] as const;
export type EventLevel = (typeof EVENT_LEVELS)[number];

/**
 * Canonical event schema. Every entry in AGENT_LOG.jsonl must satisfy this.
 * Mirrored by @jaxx/langgraph-bridge in Python.
 */
export const EventSchema = z.object({
  ts: z.string().datetime({ offset: true }),
  lvl: z.enum(EVENT_LEVELS),
  agent: z.string().min(1),
  msg: z.string().min(1),
});
export type Event = z.infer<typeof EventSchema>;

export const RepoConfigSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  defaultBranch: z.string().min(1).default("main"),
});
export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export const QualityConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    maxComplexity: z.number().int().positive().default(10),
    maxDuplicationRatio: z.number().min(0).max(1).default(0.05),
    exclude: z.array(z.string()).default([]),
  })
  .default({});
export type QualityConfig = z.infer<typeof QualityConfigSchema>;

/** frame.config.ts schema — the single whitelabel configuration surface. */
export const FrameConfigSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    logoPath: z.string().optional(),
  }),
  theme: z
    .object({
      primaryColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).default("#2563eb"),
      /** Optional page background override (defaults to the built-in dark surface). */
      backgroundColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
      borderRadius: z.string().default("0.5rem"),
    })
    .default({}),
  repos: z.array(RepoConfigSchema).default([]),
  docker: z.object({ containers: z.array(z.string()).default([]) }).default({}),
  ports: z.object({ dashboard: z.number().int().min(1).max(65535).default(3099) }).default({}),
  bridge: z
    .object({
      port: z.number().int().min(1).max(65535).default(3100),
    })
    .default({}),
  quality: QualityConfigSchema,
  tokenCountdown: z
    .object({
      enabled: z.boolean().default(false),
      /** Minutes until the countdown resets. */
      resetMinutes: z.number().int().positive().default(120),
      label: z.string().default("Token window"),
    })
    .default({}),
});
export type FrameConfig = z.infer<typeof FrameConfigSchema>;

/**
 * Skill frontmatter schema. Skills are Markdown files with YAML frontmatter.
 * NOTE: skill content is UNTRUSTED INPUT — see docs/security.md. Nothing here
 * is ever executed; `allowedTools` is declarative metadata only.
 */
export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/i),
  description: z.string().min(1).max(500),
  trigger: z.string().min(1).max(200),
  allowedTools: z.union([z.array(z.string()), z.string()]).transform((v) =>
    typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v,
  ),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.1.0"),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema> & { allowedTools: string[] };

function pathIsTraversal(p: string): boolean {
  return p.split(/[\\/]/).includes("..");
}

export function parseEvent(raw: unknown): Event | null {
  const r = EventSchema.safeParse(raw);
  return r.success ? r.data : null;
}
