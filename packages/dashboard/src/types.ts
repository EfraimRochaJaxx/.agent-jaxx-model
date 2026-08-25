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
  quality: QualityDTO;
}
