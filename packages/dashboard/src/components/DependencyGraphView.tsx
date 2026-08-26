import React, { useMemo, useState } from "react";
import type { DependencyGraphDTO, GraphEdgeDTO, GraphNodeDTO } from "../types";

interface Props {
  graph?: DependencyGraphDTO;
}

type FilterMode = "all" | "high-impact" | "circular" | "orphans";

function GraphMetricsHeader({ metrics }: { metrics: DependencyGraphDTO["metrics"] }) {
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight">Architecture & Dependency Impact Graph</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-mono">
            AST Verified
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Real-time module dependency map & blast radius analyzer. Click any file to inspect downstream impact.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">
          <span className="text-slate-500">Files:</span> <span className="font-mono text-slate-200">{metrics.totalFiles}</span>
        </div>
        <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">
          <span className="text-slate-500">Links:</span> <span className="font-mono text-slate-200">{metrics.totalEdges}</span>
        </div>
        <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">
          <span className="text-slate-500">Cycles:</span>{" "}
          <span className={`font-mono ${metrics.circularCyclesCount > 0 ? "text-amber-400 font-bold" : "text-slate-200"}`}>
            {metrics.circularCyclesCount}
          </span>
        </div>
        <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">
          <span className="text-slate-500">Orphans:</span>{" "}
          <span className={`font-mono ${metrics.orphansCount > 0 ? "text-amber-400" : "text-slate-200"}`}>
            {metrics.orphansCount}
          </span>
        </div>
      </div>
    </div>
  );
}

function GraphFilterBar({
  nodesCount,
  cyclesCount,
  orphansCount,
  filterMode,
  setFilterMode,
  search,
  setSearch,
  setZoom,
}: {
  nodesCount: number;
  cyclesCount: number;
  orphansCount: number;
  filterMode: FilterMode;
  setFilterMode: (m: FilterMode) => void;
  search: string;
  setSearch: (s: string) => void;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 w-full sm:w-auto">
        <button
          onClick={() => setFilterMode("all")}
          className={`text-xs px-2.5 py-1 rounded transition-colors ${
            filterMode === "all" ? "bg-slate-700 text-white font-medium" : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          All Files ({nodesCount})
        </button>
        <button
          onClick={() => setFilterMode("high-impact")}
          className={`text-xs px-2.5 py-1 rounded transition-colors ${
            filterMode === "high-impact" ? "bg-slate-700 text-white font-medium" : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          High Blast Radius
        </button>
        <button
          onClick={() => setFilterMode("circular")}
          className={`text-xs px-2.5 py-1 rounded transition-colors ${
            filterMode === "circular" ? "bg-slate-700 text-amber-300 font-medium" : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          Cycles ({cyclesCount})
        </button>
        <button
          onClick={() => setFilterMode("orphans")}
          className={`text-xs px-2.5 py-1 rounded transition-colors ${
            filterMode === "orphans" ? "bg-slate-700 text-slate-200 font-medium" : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          Orphans ({orphansCount})
        </button>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <input
          type="text"
          placeholder="Search file name (e.g. schemas.ts)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
        />
        <button
          onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
          className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-300 hover:bg-slate-800"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
          className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-300 hover:bg-slate-800"
          title="Zoom out"
        >
          -
        </button>
        <button
          onClick={() => setZoom(1)}
          className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-400 hover:bg-slate-800"
          title="Reset zoom"
        >
          1x
        </button>
      </div>
    </div>
  );
}

function SvgDefs() {
  return (
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
      </marker>
      <marker id="arrow-active" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--jx-primary)" />
      </marker>
    </defs>
  );
}

function isEdgeActive(e: GraphEdgeDTO, selectedNode: GraphNodeDTO | null): boolean {
  if (!selectedNode) return false;
  const isDirectImport = e.source === selectedNode.id && selectedNode.imports.includes(e.target);
  const isDirectDependant = e.target === selectedNode.id && selectedNode.importedBy.includes(e.source);
  return isDirectImport || isDirectDependant;
}

function getEdgeStroke(active: boolean, isCircular?: boolean): string {
  if (active) return "var(--jx-primary)";
  if (isCircular) return "#f59e0b";
  return "#334155";
}

function SvgEdge({
  edge,
  posMap,
  selectedNode,
}: {
  edge: GraphEdgeDTO;
  posMap: Map<string, { x: number; y: number }>;
  selectedNode: GraphNodeDTO | null;
}) {
  const src = posMap.get(edge.source);
  const tgt = posMap.get(edge.target);
  if (!src || !tgt) return null;

  const active = isEdgeActive(edge, selectedNode);
  const opacity = !selectedNode || active ? 0.85 : 0.15;

  return (
    <line
      x1={src.x}
      y1={src.y}
      x2={tgt.x}
      y2={tgt.y}
      stroke={getEdgeStroke(active, edge.isCircular)}
      strokeWidth={active ? 2 : 1}
      strokeDasharray={edge.isCircular ? "4,4" : undefined}
      markerEnd={active ? "url(#arrow-active)" : "url(#arrow)"}
      opacity={opacity}
      className="transition-all duration-200"
    />
  );
}

function getNodeFill(isSelected: boolean, isConnected: boolean): string {
  if (isSelected) return "var(--jx-primary)";
  if (isConnected) return "color-mix(in srgb, var(--jx-primary) 35%, #0f172a)";
  return "#0f172a";
}

function getNodeStroke(isSelected: boolean, isConnected: boolean, isCircular: boolean, isOrphan: boolean): string {
  if (isSelected) return "#ffffff";
  if (isConnected) return "var(--jx-primary)";
  if (isCircular) return "#f59e0b";
  if (isOrphan) return "#64748b";
  return "#334155";
}

function getNodeTextColor(isSelected: boolean, isConnected: boolean): string {
  if (isSelected) return "fill-teal-300 font-bold";
  if (isConnected) return "fill-slate-200";
  return "fill-slate-400";
}

function SvgNode({
  node,
  pos,
  selectedId,
  onSelect,
  connectedSet,
  hasSelection,
}: {
  node: GraphNodeDTO;
  pos: { x: number; y: number };
  selectedId: string | null;
  onSelect: (id: string) => void;
  connectedSet: Set<string>;
  hasSelection: boolean;
}) {
  const isSelected = selectedId === node.id;
  const isConnected = connectedSet.has(node.id);
  const isDimmed = hasSelection && !isConnected;
  const radius = Math.min(18, Math.max(9, 9 + node.impactCount * 1.5));
  const fill = getNodeFill(isSelected, isConnected);
  const stroke = getNodeStroke(isSelected, isConnected, node.isCircular, node.isOrphan);
  const textColor = getNodeTextColor(isSelected, isConnected);

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      onClick={() => onSelect(node.id)}
      className="cursor-pointer group"
      opacity={isDimmed ? 0.2 : 1}
    >
      <circle
        r={radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={isSelected ? 2.5 : isConnected ? 2 : 1.2}
        strokeDasharray={node.isOrphan ? "3,3" : undefined}
        className="transition-all duration-200 group-hover:stroke-teal-300"
      />
      <text
        y={radius + 11}
        textAnchor="middle"
        className={`text-[9px] select-none font-mono transition-colors ${textColor}`}
      >
        {node.name}
      </text>
    </g>
  );
}

function GraphSvgCanvas({
  layout,
  edges,
  filteredNodes,
  selectedId,
  selectedNode,
  connectedSet,
  zoom,
  onSelectNode,
}: {
  layout: { width: number; height: number; posMap: Map<string, { x: number; y: number }> };
  edges: GraphEdgeDTO[];
  filteredNodes: GraphNodeDTO[];
  selectedId: string | null;
  selectedNode: GraphNodeDTO | null;
  connectedSet: Set<string>;
  zoom: number;
  onSelectNode: (id: string | null) => void;
}) {
  return (
    <div className="lg:col-span-2 relative bg-slate-950/60 rounded-lg border border-slate-900 overflow-hidden h-[460px] flex items-center justify-center">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-150"
        style={{ transform: `scale(${zoom})` }}
      >
        <SvgDefs />
        {edges.map((e) => (
          <SvgEdge key={`${e.source}->${e.target}`} edge={e} posMap={layout.posMap} selectedNode={selectedNode} />
        ))}
        {filteredNodes.map((n) => {
          const pos = layout.posMap.get(n.id);
          if (!pos) return null;
          return (
            <SvgNode
              key={n.id}
              node={n}
              pos={pos}
              selectedId={selectedId}
              onSelect={(id) => onSelectNode(selectedId === id ? null : id)}
              connectedSet={connectedSet}
              hasSelection={Boolean(selectedNode)}
            />
          );
        })}
      </svg>
      <div className="absolute bottom-2 left-3 text-[10px] text-slate-500 select-none pointer-events-none">
        Click a file to inspect blast radius & connections
      </div>
    </div>
  );
}

function NodeStatsCards({ node }: { node: GraphNodeDTO }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center text-xs">
      <div className="bg-slate-950 p-2 rounded border border-slate-800">
        <div className="text-slate-500 text-[10px]">LOC</div>
        <div className="font-mono font-medium text-slate-200">{node.linesOfCode}</div>
      </div>
      <div className="bg-slate-950 p-2 rounded border border-slate-800">
        <div className="text-slate-500 text-[10px]">Complexity</div>
        <div className={`font-mono font-medium ${node.maxComplexity > 10 ? "text-red-400" : "text-slate-200"}`}>
          {node.maxComplexity}
        </div>
      </div>
      <div className="bg-slate-950 p-2 rounded border border-slate-800">
        <div className="text-slate-500 text-[10px]">Blast Radius</div>
        <div className="font-mono font-bold" style={{ color: "var(--jx-primary)" }}>
          {node.impactCount}
        </div>
      </div>
    </div>
  );
}

function NodeImpactSection({ node, onSelect }: { node: GraphNodeDTO; onSelect: (id: string) => void }) {
  return (
    <div
      className="p-2.5 rounded-md border text-xs"
      style={{
        background: "color-mix(in srgb, var(--jx-primary) 8%, transparent)",
        borderColor: "color-mix(in srgb, var(--jx-primary) 25%, transparent)",
      }}
    >
      <div className="font-medium flex items-center justify-between" style={{ color: "var(--jx-primary)" }}>
        <span>Downstream Blast Radius</span>
        <span>{node.impactCount} affected</span>
      </div>
      <p className="text-[11px] text-slate-400 mt-1">
        Modifying this file will directly or transitively impact the following modules:
      </p>
      {node.impact.length > 0 ? (
        <ul className="mt-1.5 space-y-1 max-h-24 overflow-y-auto font-mono text-[10px]">
          {node.impact.map((f) => (
            <li
              key={f}
              onClick={() => onSelect(f)}
              className="text-slate-300 hover:text-teal-300 cursor-pointer flex items-center gap-1 truncate"
            >
              <span className="text-slate-600">↳</span> {f}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] text-slate-500 mt-1 italic">
          Leaf node — no downstream files depend on this file.
        </p>
      )}
    </div>
  );
}

function NodeConnectionsSection({ node, onSelect }: { node: GraphNodeDTO; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-2 text-xs flex-1">
      <div>
        <span className="text-slate-500 font-medium">Direct Imports ({node.imports.length}):</span>
        {node.imports.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1">
            {node.imports.map((imp) => (
              <span
                key={imp}
                onClick={() => onSelect(imp)}
                className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300 hover:border-slate-600 cursor-pointer truncate max-w-full"
              >
                {imp.split("/").pop()}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-slate-600 italic">None</p>
        )}
      </div>

      <div>
        <span className="text-slate-500 font-medium">Directly Imported By ({node.importedBy.length}):</span>
        {node.importedBy.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1">
            {node.importedBy.map((by) => (
              <span
                key={by}
                onClick={() => onSelect(by)}
                className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300 hover:border-slate-600 cursor-pointer truncate max-w-full"
              >
                {by.split("/").pop()}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-slate-600 italic">None (Root or Entry point)</p>
        )}
      </div>
    </div>
  );
}

function GraphInspector({
  selectedNode,
  onClose,
  onSelect,
}: {
  selectedNode: GraphNodeDTO | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  if (!selectedNode) {
    return (
      <div className="bg-slate-900/70 rounded-lg border border-slate-800 p-4 h-[460px] flex flex-col items-center justify-center text-center text-slate-500">
        <div className="w-10 h-10 rounded-full border border-slate-800 flex items-center justify-center mb-2 text-slate-400 font-mono">
          ⌘
        </div>
        <h4 className="font-medium text-slate-300 text-xs">Impact Inspector</h4>
        <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
          Select any node in the graph to view its imports, dependents, and calculate the exact blast radius before editing code.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/70 rounded-lg border border-slate-800 p-4 h-[460px] flex flex-col space-y-3.5 min-h-0 overflow-y-auto">
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div>
          <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-1.5 font-mono">
            {selectedNode.name}
            {selectedNode.isCircular && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Circular</span>
            )}
            {selectedNode.isOrphan && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">Orphan</span>
            )}
          </h3>
          <p className="text-xs text-slate-500 font-mono break-all">{selectedNode.id}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xs px-1">
          ✕
        </button>
      </div>
      <NodeStatsCards node={selectedNode} />
      <NodeImpactSection node={selectedNode} onSelect={onSelect} />
      <NodeConnectionsSection node={selectedNode} onSelect={onSelect} />
    </div>
  );
}

function computeLayout(filteredNodes: GraphNodeDTO[]) {
  const width = 900;
  const height = 550;
  const padding = 50;

  const dirGroups = new Map<string, GraphNodeDTO[]>();
  for (const n of filteredNodes) {
    const g = dirGroups.get(n.dir) ?? [];
    g.push(n);
    dirGroups.set(n.dir, g);
  }

  const posMap = new Map<string, { x: number; y: number }>();
  const dirs = [...dirGroups.keys()].sort();
  const cols = Math.max(1, dirs.length);
  const colWidth = (width - padding * 2) / cols;

  dirs.forEach((dir, colIdx) => {
    const items = dirGroups.get(dir)!;
    const rowHeight = (height - padding * 2) / Math.max(1, items.length);
    items.forEach((item, rowIdx) => {
      const x = padding + colIdx * colWidth + colWidth / 2;
      const y = padding + rowIdx * rowHeight + rowHeight / 2;
      posMap.set(item.id, { x, y });
    });
  });

  return { width, height, posMap };
}

function filterGraphNodes(nodes: GraphNodeDTO[], search: string, mode: FilterMode): GraphNodeDTO[] {
  return nodes.filter((n) => {
    if (search && !n.id.toLowerCase().includes(search.toLowerCase())) return false;
    if (mode === "high-impact") return n.impactCount >= 2;
    if (mode === "circular") return n.isCircular;
    if (mode === "orphans") return n.isOrphan;
    return true;
  });
}

export function DependencyGraphView({ graph }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [zoom, setZoom] = useState(1);

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const metrics = graph?.metrics ?? {
    totalFiles: 0,
    totalEdges: 0,
    circularCyclesCount: 0,
    orphansCount: 0,
    highestImpactFile: null,
  };

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);
  const filteredNodes = useMemo(() => filterGraphNodes(nodes, search, filterMode), [nodes, search, filterMode]);
  const layout = useMemo(() => computeLayout(filteredNodes), [filteredNodes]);

  const activeConnectedSet = useMemo(() => {
    const set = new Set<string>();
    if (selectedNode) {
      set.add(selectedNode.id);
      selectedNode.imports.forEach((i) => set.add(i));
      selectedNode.importedBy.forEach((b) => set.add(b));
      selectedNode.impact.forEach((im) => set.add(im));
    }
    return set;
  }, [selectedNode]);

  if (!graph || nodes.length === 0) {
    return (
      <div className="card p-6 text-center text-slate-500">
        <p className="text-sm">No dependency graph available. Run <code className="text-slate-400">jaxx doctor --quality</code> to generate graph.</p>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4">
      <GraphMetricsHeader metrics={metrics} />
      <GraphFilterBar
        nodesCount={nodes.length}
        cyclesCount={metrics.circularCyclesCount}
        orphansCount={metrics.orphansCount}
        filterMode={filterMode}
        setFilterMode={setFilterMode}
        search={search}
        setSearch={setSearch}
        setZoom={setZoom}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <GraphSvgCanvas
          layout={layout}
          edges={edges}
          filteredNodes={filteredNodes}
          selectedId={selectedId}
          selectedNode={selectedNode}
          connectedSet={activeConnectedSet}
          zoom={zoom}
          onSelectNode={setSelectedId}
        />
        <GraphInspector
          selectedNode={selectedNode}
          onClose={() => setSelectedId(null)}
          onSelect={setSelectedId}
        />
      </div>
    </div>
  );
}

