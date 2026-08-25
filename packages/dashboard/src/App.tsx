import React, { useEffect, useState } from "react";
import type { AllResponse, EventDTO } from "./types";

const POLL_MS = 10_000;

/** Render crashes must never produce a silent blank screen. */
export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<unknown>(null);
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="card p-6 max-w-xl">
          <h1 className="text-lg font-semibold text-red-300 mb-2">Interface error</h1>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap">{String(error)}</pre>
          <button className="mt-4 px-3 py-1.5 rounded text-sm" style={{ background: "var(--jx-primary)", color: "#0A0B0D" }} onClick={() => setError(null)}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  return (
    <ErrorCatcher onError={setError}>
      {children}
    </ErrorCatcher>
  );
}

class ErrorCatcher extends React.Component<{ onError: (e: unknown) => void; children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

const LEVEL_STYLE: Record<string, string> = {
  INFO: "bg-sky-500/15 text-sky-300",
  WARN: "bg-amber-500/15 text-amber-300",
  ERROR: "bg-red-500/15 text-red-300",
  DONE: "bg-emerald-500/15 text-emerald-300",
  AGENT: "bg-violet-500/15 text-violet-300",
  GIT: "bg-slate-500/20 text-slate-300",
};

export default function App() {
  const [data, setData] = useState<AllResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/all");
        if (!res.ok) throw new Error(`API ${res.status}`);
        const json = (await res.json()) as AllResponse;
        if (!alive) return;
        setData(json);
        setError(null);
        applyTheme(json.theme);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Control plane unavailable</h1>
          <p className="text-slate-400">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading control plane…
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {data.project.logoUrl && (
            <img src={data.project.logoUrl} alt="" className="h-9 w-9 rounded object-contain" />
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{data.project.name}</h1>
            <p className="text-xs text-slate-500">Control Center — polling every {POLL_MS / 1000}s · last sync {new Date(data.ts).toLocaleTimeString()}</p>
          </div>
        </div>
        {data.tokenCountdown.enabled && (
          <TokenCountdown minutes={data.tokenCountdown.resetMinutes} label={data.tokenCountdown.label} />
        )}
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AgentLog events={data.agentLog.events} />
        <GitPanel repos={data.repos} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DockerPanel docker={data.docker} />
        <SkillsPanel skills={data.skills.skills} issues={data.skills.issues} />
        <QualityPanel quality={data.quality} />
      </section>

      <BridgePanel events={data.agentLog.events} bridge={data.bridge} />
    </div>
  );
}

const BRIDGE_NODES = [
  { id: "orchestrator", label: "Orchestrator", role: "plans & delegates" },
  { id: "coder", label: "Coder", role: "implements" },
  { id: "reviewer", label: "Reviewer", role: "reviews" },
  { id: "qa", label: "QA", role: "verifies" },
] as const;

function BridgePanel({ events, bridge }: { events: EventDTO[]; bridge?: { running: boolean; port: number } }) {
  const counts = new Map<string, number>();
  let lastAt = "";
  for (const e of events) {
    const node = BRIDGE_NODES.find((n) => n.id === e.agent) ?? (e.agent === "bridge" ? { id: "bridge", label: "", role: "" } : null);
    if (!node) continue;
    if (node.id !== "bridge") counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
    if (!lastAt || e.ts > lastAt) lastAt = e.ts;
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const service = bridge?.running
    ? { text: `service running at :${bridge.port}`, cls: "text-emerald-300" }
    : { text: "service idle", cls: "text-slate-500" };

  return (
    <Card title="Multi-Agent Graph (LangGraph bridge)" right={
      <span className={`text-xs ${service.cls}`}>{service.text}{total > 0 && bridge?.running ? ` · last event ${fmtTime(lastAt)}` : ""}</span>
    }>
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        {BRIDGE_NODES.map((n, i) => (
          <div key={n.id} className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className={`flex-1 rounded-lg border p-3 transition-colors ${
                counts.get(n.id) ? "border-transparent" : "border-slate-800"
              }`}
              style={
                counts.get(n.id)
                  ? { background: "color-mix(in srgb, var(--jx-primary) 10%, transparent)", borderColor: "color-mix(in srgb, var(--jx-primary) 40%, transparent)" }
                  : undefined
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{n.label}</span>
                <span className="font-mono text-sm" style={{ color: counts.get(n.id) ? "var(--jx-primary)" : undefined }}>
                  {counts.get(n.id) ?? 0}
                </span>
              </div>
              <p className="text-xs text-slate-500">{n.role}</p>
            </div>
            {i < BRIDGE_NODES.length - 1 && (
              <span className="text-slate-600 hidden lg:block" aria-hidden>→</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Every node appends to the shared AGENT_LOG.jsonl — the counters above are derived from the same audit log.
        Start it with <code className="text-slate-400">jaxx bridge start</code> or <code className="text-slate-400">npm run dashboard:start:bridge</code>.
      </p>
    </Card>
  );
}

function applyTheme(theme: { primaryColor: string; backgroundColor?: string; borderRadius: string }) {
  document.documentElement.style.setProperty("--jx-primary", theme.primaryColor);
  document.documentElement.style.setProperty("--jx-radius", theme.borderRadius);
  if (theme.backgroundColor) {
    document.documentElement.style.setProperty("--jx-bg", theme.backgroundColor);
  }
}

function Card({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function AgentLog({ events }: { events: EventDTO[] }) {
  return (
    <Card title="Agent Log" className="lg:col-span-2" right={<span className="text-xs text-slate-500">{events.length} recent</span>}>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500 sticky top-0 bg-slate-900">
            <tr>
              <th className="py-2 pr-3">Time</th>
              <th className="py-2 pr-3">Level</th>
              <th className="py-2 pr-3">Agent</th>
              <th className="py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i} className="border-t border-slate-800/60 align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap text-slate-400 font-mono text-xs">{fmtTime(e.ts)}</td>
                <td className="py-1.5 pr-3">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_STYLE[e.lvl] ?? "bg-slate-700/30 text-slate-300"}`}>{e.lvl}</span>
                </td>
                <td className="py-1.5 pr-3 text-slate-300">{e.agent}</td>
                <td className="py-1.5 text-slate-200 break-all">{e.msg}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-slate-500 text-center">No events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GitPanel({ repos }: { repos: { name: string; isRepo: boolean; branch?: string; hash?: string; subject?: string; dirty?: boolean; recentCommits?: { hash: string; subject: string; relTime: string; author: string }[] }[] }) {
  return (
    <Card title="Git">
      <div className="space-y-4 max-h-[420px] overflow-y-auto">
        {repos.map((r) => (
          <div key={r.name}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{r.name}</span>
              {r.isRepo ? (
                <>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${r.dirty ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                    {r.dirty ? "dirty" : "clean"}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">{r.branch} @ {r.hash}</span>
                </>
              ) : (
                <span className="text-xs text-red-300">not a repository</span>
              )}
            </div>
            {r.recentCommits && r.recentCommits.length > 0 && (
              <ul className="space-y-0.5">
                {r.recentCommits.slice(0, 5).map((c) => (
                  <li key={c.hash} className="text-xs text-slate-400 truncate">
                    <span className="font-mono text-slate-500">{c.hash}</span> {c.subject} <span className="text-slate-600">· {c.relTime}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {repos.length === 0 && <p className="text-slate-500 text-sm">No repositories configured.</p>}
      </div>
    </Card>
  );
}

function DockerPanel({ docker }: { docker: { available: boolean; containers: { name: string; configured: boolean; running: boolean; status?: string }[] } }) {
  return (
    <Card title="Docker" right={!docker.available && <span className="text-xs text-slate-500">CLI unavailable</span>}>
      <ul className="space-y-2">
        {docker.containers.map((c) => (
          <li key={c.name} className="flex items-center justify-between text-sm">
            <span>{c.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${c.running ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
              {c.running ? "running" : "stopped"}
            </span>
          </li>
        ))}
        {docker.containers.length === 0 && <p className="text-slate-500 text-sm">No containers configured.</p>}
      </ul>
    </Card>
  );
}

function SkillsPanel({ skills, issues }: { skills: { name: string; version: string; description: string; trigger: string }[]; issues: { filePath: string; reason: string }[] }) {
  return (
    <Card title="Skills" right={<span className="text-xs text-slate-500">{skills.length}</span>}>
      <ul className="space-y-2 max-h-[220px] overflow-y-auto">
        {skills.map((s) => (
          <li key={s.file ?? s.name} className="text-sm">
            <span className="font-medium">{s.name}</span> <span className="text-xs text-slate-500">v{s.version}</span>
            <p className="text-xs text-slate-400 line-clamp-2">{s.description}</p>
          </li>
        ))}
        {skills.length === 0 && <p className="text-slate-500 text-sm">No skills installed.</p>}
      </ul>
      {issues.length > 0 && (
        <p className="mt-3 text-xs text-amber-300">{issues.length} skill file(s) with problems.</p>
      )}
    </Card>
  );
}

function QualityPanel({ quality }: { quality: { exists: boolean; passed?: boolean; violations?: string[]; generatedAt?: string } }) {
  return (
    <Card title="Quality" right={
      quality.exists ? (
        <span className={`text-xs px-1.5 py-0.5 rounded ${quality.passed ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
          {quality.passed ? "PASS" : "FAIL"}
        </span>
      ) : undefined
    }>
      {quality.exists ? (
        <div className="text-sm space-y-2">
          <ul className="space-y-1 max-h-[200px] overflow-y-auto">
            {(quality.violations ?? []).map((v, i) => (
              <li key={i} className="text-xs text-red-300 break-all">• {v}</li>
            ))}
            {(quality.violations ?? []).length === 0 && (
              <li className="text-xs text-emerald-300">All thresholds met.</li>
            )}
          </ul>
          {quality.generatedAt && <p className="text-xs text-slate-500">generated {new Date(quality.generatedAt).toLocaleString()}</p>}
        </div>
      ) : (
        <p className="text-slate-500 text-sm">No quality scorecard yet. Run <code className="text-slate-300">jaxx doctor --quality</code>.</p>
      )}
    </Card>
  );
}

function TokenCountdown({ minutes, label }: { minutes: number; label: string }) {
  const [remaining, setRemaining] = useState(minutes * 60);
  useEffect(() => {
    setRemaining(minutes * 60);
    const id = setInterval(() => setRemaining((r) => (r <= 1 ? minutes * 60 : r - 1)), 1000);
    return () => clearInterval(id);
  }, [minutes]);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const pct = ((minutes * 60 - remaining) / (minutes * 60)) * 100;
  return (
    <div className="text-right min-w-[160px]">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-mono text-lg" style={{ color: "var(--jx-primary)" }}>
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </p>
      <div className="h-1 mt-1 rounded bg-slate-800 overflow-hidden">
        <div className="h-full transition-all duration-1000" style={{ width: `${pct}%`, background: "var(--jx-primary)" }} />
      </div>
    </div>
  );
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}
