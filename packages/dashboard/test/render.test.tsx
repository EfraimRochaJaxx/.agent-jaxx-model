// @vitest-environment jsdom
/**
 * Render smoke test: mounts the real App against the EXACT payload shape the
 * server produces (packages/dashboard/server/server.ts snapshot()). Guards
 * against contract mismatches between API and UI that cause blank screens.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App";

function serverPayload() {
  // Mirrors snapshot() in server/server.ts
  return {
    ts: new Date().toISOString(),
    project: { name: "Render Test", logoUrl: null },
    theme: { primaryColor: "#00FFD1", backgroundColor: "#0A0B0D", borderRadius: "0.5rem" },
    tokenCountdown: { enabled: true, resetMinutes: 120, label: "Token window" },
    repos: [
      {
        name: "main",
        path: ".",
        isRepo: true,
        branch: "main",
        hash: "abc1234",
        subject: "feat: something",
        dirty: false,
        recentCommits: [{ hash: "abc1234", subject: "feat: something", relTime: "now", author: "t" }],
      },
    ],
    docker: { available: false, containers: [] },
    agentLog: {
      events: [{ ts: new Date().toISOString(), lvl: "INFO", agent: "t", msg: "hello render" }],
      malformedLines: 0,
    },
    skills: {
      skills: [
        { name: "demo", description: "d", trigger: "t", allowedTools: ["read"], version: "1.0.0", file: "demo.md" },
      ],
      issues: [],
    },
    quality: {
      exists: true,
      generatedAt: new Date().toISOString(),
      passed: true,
      violations: [],
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App rendering against real server payload", () => {
  it("renders all panels without crashing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => serverPayload(),
    })));

    render(<App />);

    expect(await screen.findByText("Render Test")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("hello render")).toBeTruthy();
      expect(screen.getByText("demo")).toBeTruthy();
      expect(screen.getByText("PASS")).toBeTruthy();
      expect(screen.getByText("Token window")).toBeTruthy();
      expect(screen.getByText("main")).toBeTruthy();
    });
  });

  it("shows the error state when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    render(<App />);
    expect(await screen.findByText(/Control plane unavailable/)).toBeTruthy();
  });
});
