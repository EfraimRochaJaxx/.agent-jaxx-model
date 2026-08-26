export interface EventDTO {
  ts: string;
  lvl: string;
  agent: string;
  msg: string;
}

export interface CommitDTO {
  hash: string;
  subject: string;
  relTime: string;
  author: string;
}

export interface RepoDTO {
  name: string;
  path: string;
  isRepo: boolean;
  branch?: string;
  hash?: string;
  subject?: string;
  dirty?: boolean;
  recentCommits?: CommitDTO[];
}

export interface DockerDTO {
  available: boolean;
  containers: { name: string; configured: boolean; running: boolean; status?: string }[];
}

export interface SkillDTO {
  name: string;
  description: string;
  trigger: string;
  allowedTools: string[];
  version: string;
  file: string;
}

export interface GraphNodeDTO {
  id: string;
  name: string;
  dir: string;
  linesOfCode: number;
  maxComplexity: number;
  imports: string[];
  importedBy: string[];
  impact: string[];
  impactCount: number;
  isCircular: boolean;
  isOrphan: boolean;
}

export interface GraphEdgeDTO {
  source: string;
  target: string;
  isCircular?: boolean;
}

export interface DependencyGraphDTO {
  generatedAt: string;
  root: string;
  nodes: GraphNodeDTO[];
  edges: GraphEdgeDTO[];
  metrics: {
    totalFiles: number;
    totalEdges: number;
    circularCyclesCount: number;
    orphansCount: number;
    highestImpactFile: { id: string; impactCount: number } | null;
  };
  circularCycles?: string[][];
}

export interface QualityDTO {
  exists: boolean;
  generatedAt?: string;
  passed?: boolean;
  violations?: string[];
  summary?: string;
}

export interface AllResponse {
  ts: string;
  project: { name: string; logoUrl: string | null };
  theme: { primaryColor: string; backgroundColor?: string; borderRadius: string };
  tokenCountdown: { enabled: boolean; resetMinutes: number; label: string };
  repos: RepoDTO[];
  docker: DockerDTO;
  agentLog: { events: EventDTO[]; malformedLines: number };
  skills: { skills: SkillDTO[]; issues: { filePath: string; reason: string }[] };
  bridge?: { running: boolean; port: number };
  quality: QualityDTO;
  graph?: DependencyGraphDTO;
}
