import { describe, expect, it } from "vitest";
import {
  EventSchema,
  FrameConfigSchema,
  SkillFrontmatterSchema,
} from "../src/schemas";

describe("EventSchema", () => {
  const valid = { ts: "2026-08-25T10:00:00.000Z", lvl: "INFO", agent: "ox", msg: "hello" };

  it("accepts a valid event", () => {
    expect(EventSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unknown levels", () => {
    expect(EventSchema.safeParse({ ...valid, lvl: "VERBOSE" }).success).toBe(false);
  });

  it("requires ISO8601 timestamps with offset", () => {
    expect(EventSchema.safeParse({ ...valid, ts: "yesterday" }).success).toBe(false);
  });

  it("rejects empty agent or message", () => {
    expect(EventSchema.safeParse({ ...valid, agent: "" }).success).toBe(false);
    expect(EventSchema.safeParse({ ...valid, msg: "" }).success).toBe(false);
  });
});

describe("FrameConfigSchema", () => {
  it("applies defaults to a minimal config", () => {
    const cfg = FrameConfigSchema.parse({
      project: { name: "Demo" },
      repos: [],
      docker: { containers: [] },
      ports: { dashboard: 3099 },
      quality: {},
    });
    expect(cfg.theme.primaryColor).toBe("#2563eb");
    expect(cfg.quality.maxComplexity).toBe(10);
    expect(cfg.ports.dashboard).toBe(3099);
  });

  it("accepts full config", () => {
    const parsed = FrameConfigSchema.safeParse({
      project: { name: "X", logoPath: "./logo.svg" },
      theme: { primaryColor: "#ff0000", borderRadius: "1rem" },
      repos: [{ name: "api", path: "./packages/api", defaultBranch: "main" }],
      docker: { containers: ["db"] },
      ports: { dashboard: 4000 },
      quality: { maxComplexity: 15 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects traversal-style repo paths", () => {
    const parsed = FrameConfigSchema.safeParse({
      project: { name: "X" },
      repos: [{ name: "evil", path: "../../etc" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("SkillFrontmatterSchema", () => {
  it("parses comma-separated allowedTools", () => {
    const fm = SkillFrontmatterSchema.parse({
      name: "code-review",
      description: "Reviews code",
      trigger: "when reviewing PRs",
      allowedTools: "read, grep",
      version: "1.0.0",
    });
    expect(fm.allowedTools).toEqual(["read", "grep"]);
  });

  it("defaults version and rejects bad semver", () => {
    const base = {
      name: "s",
      description: "d",
      trigger: "t",
      allowedTools: ["a"],
    };
    expect(SkillFrontmatterSchema.parse(base).version).toBe("0.1.0");
    expect(
      SkillFrontmatterSchema.safeParse({ ...base, version: "latest" }).success,
    ).toBe(false);
  });

  it("rejects names with slashes (path injection)", () => {
    expect(
      SkillFrontmatterSchema.safeParse({
        name: "../../etc/passwd",
        description: "d",
        trigger: "t",
        allowedTools: [],
      }).success,
    ).toBe(false);
  });
});
