/** Shared shapes for the eco-core data layer. Nothing in this module imports
 * dsh or cordis: the core is a plain Node library the plugin and the CLI both
 * drive. `null` means "the source said nothing"; `undefined` is reserved for
 * optional call arguments. */

export interface RepoFacts {
  /** canonical owner/repo, lowercased owner only (GitHub is case-insensitive) */
  id: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  license: string | null;
  topics: string[];
  createdAt: string;
  pushedAt: string;
  lastCommitAt: string | null;
  contributors: number | null;
  /** null = not measured yet, false = measured and absent */
  ci: boolean | null;
  testsCount: number | null;
  issueCloseHours: number | null;
  archived: boolean;
  /** GraphQL node id, used to batch detail lookups within a scan */
  nodeId?: string;
}

export interface StoredRepo extends RepoFacts {
  detailsFetchedAt: string | null;
  updatedAt: string;
}

export interface SnapshotWrite {
  repoId: string;
  date: string;
  stars: number;
  npmWeekly: number | null;
  releaseDownloads: number | null;
  segment: string;
  segmentConfidence: number | null;
}

export interface SnapshotRow extends SnapshotWrite {
  id: number;
  createdAt: string;
}

export interface SegmentLabel {
  segment: string;
  confidence: number;
  source: 'rules' | 'override' | 'legacy';
}

export interface NpmStat {
  name: string;
  weekly: number;
  prev: number;
  growthPct: number | null;
  fetchedAt: string;
}

export interface MappingRow {
  repoId: string;
  npmName: string;
  confidence: number;
  source: 'manual' | 'awesome' | 'registry' | 'heuristic';
}

export type ScanStatus = 'ok' | 'partial' | 'failed';

export interface ScanRecord {
  id: number;
  scanDate: string;
  repoCount: number;
  durationMs: number;
  status: ScanStatus;
  error: string | null;
  stage: string;
  checkpoint: Record<string, unknown>;
  createdAt: string;
}

export type ErrorsByStage = Record<string, string[]>;

export interface HealthReport {
  dbPath: string;
  schemaVersion: number;
  repos: number;
  snapshots: number;
  npmPackages: number;
  mappings: number;
  lastScan: ScanRecord | null;
  dates: string[];
  recentErrors: { scanDate: string; stage: string; message: string }[];
}

export interface OverviewRow {
  segment: string;
  repos: number;
  stars: number;
  weeklyDownloads: number;
  medianStars: number;
  multiLabel: number;
}

export interface DiffRow {
  repoId: string;
  segment: string;
  from: { date: string; stars: number; npmWeekly: number | null; releaseDownloads: number | null } | null;
  to: { date: string; stars: number; npmWeekly: number | null; releaseDownloads: number | null };
  starsDelta: number;
  npmDelta: number | null;
  releaseDelta: number | null;
}

export interface TopRow {
  repoId: string;
  segment: string;
  score: number;
  velocity: number;
  adoption: number;
  quality: number;
  maintenance: number;
  cohort: string;
  rank: number;
  insufficient: boolean;
  outlier: boolean;
  npmWeekly: number | null;
  releaseDownloads: number | null;
  stars: number;
  description: string;
}
