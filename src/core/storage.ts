/** Persistence API over the v2 schema. Every write is an idempotent upsert so
 * a crashed scan can be resumed without duplicating rows. */
import type { EcoDb } from './db.ts';
import { getMeta, setMeta, transaction } from './db.ts';
import type {
  ErrorsByStage,
  HealthReport,
  MappingRow,
  NpmStat,
  RepoFacts,
  ScanRecord,
  ScanStatus,
  SegmentLabel,
  SnapshotRow,
  SnapshotWrite,
  StoredRepo,
} from './types.ts';
import { asStringArray, normalizeRepoId } from './util.ts';

interface RepoRow {
  id: string;
  description: string;
  stars: number;
  forks: number;
  open_issues: number;
  language: string | null;
  license: string | null;
  topics: string;
  created_at: string;
  pushed_at: string;
  last_commit_at: string | null;
  contributors_count: number | null;
  ci: number | null;
  tests_count: number | null;
  issue_close_hours: number | null;
  archived: number;
  details_fetched_at: string | null;
  updated_at: string;
}

function toRepo(row: RepoRow): StoredRepo {
  return {
    id: row.id,
    description: row.description,
    stars: row.stars,
    forks: row.forks,
    openIssues: row.open_issues,
    language: row.language,
    license: row.license,
    topics: asStringArray(JSON.parse(row.topics) as unknown),
    createdAt: row.created_at,
    pushedAt: row.pushed_at,
    lastCommitAt: row.last_commit_at,
    contributors: row.contributors_count,
    ci: row.ci === null ? null : row.ci !== 0,
    testsCount: row.tests_count,
    issueCloseHours: row.issue_close_hours,
    archived: row.archived !== 0,
    detailsFetchedAt: row.details_fetched_at,
    updatedAt: row.updated_at,
  };
}

export function upsertRepo(db: EcoDb, facts: RepoFacts, now = new Date().toISOString()): void {
  db.raw
    .prepare(
      `INSERT INTO repos (id, description, stars, forks, open_issues, language, license, topics,
         created_at, pushed_at, last_commit_at, contributors_count, ci, tests_count, issue_close_hours,
         archived, details_fetched_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         description = excluded.description,
         stars = excluded.stars,
         forks = excluded.forks,
         open_issues = excluded.open_issues,
         language = excluded.language,
         license = excluded.license,
         topics = excluded.topics,
         created_at = excluded.created_at,
         pushed_at = excluded.pushed_at,
         last_commit_at = COALESCE(excluded.last_commit_at, repos.last_commit_at),
         contributors_count = COALESCE(excluded.contributors_count, repos.contributors_count),
         ci = COALESCE(excluded.ci, repos.ci),
         tests_count = COALESCE(excluded.tests_count, repos.tests_count),
         issue_close_hours = COALESCE(excluded.issue_close_hours, repos.issue_close_hours),
         archived = excluded.archived,
         details_fetched_at = COALESCE(excluded.details_fetched_at, repos.details_fetched_at),
         updated_at = excluded.updated_at`,
    )
    .run(
      normalizeRepoId(facts.id),
      facts.description,
      facts.stars,
      facts.forks,
      facts.openIssues,
      facts.language,
      facts.license,
      JSON.stringify(facts.topics),
      facts.createdAt,
      facts.pushedAt,
      facts.lastCommitAt,
      facts.contributors,
      facts.ci === null ? null : facts.ci ? 1 : 0,
      facts.testsCount,
      facts.issueCloseHours,
      facts.archived ? 1 : 0,
      null,
      now,
    );
}

export function upsertRepoDetails(db: EcoDb, facts: RepoFacts, now = new Date().toISOString()): void {
  upsertRepo(db, facts, now);
  db.raw.prepare('UPDATE repos SET details_fetched_at = ? WHERE id = ?').run(now, normalizeRepoId(facts.id));
}

export function getRepo(db: EcoDb, id: string): StoredRepo | null {
  const row = db.raw.prepare('SELECT * FROM repos WHERE id = ?').get(normalizeRepoId(id)) as RepoRow | undefined;
  return row ? toRepo(row) : null;
}

export function allRepos(db: EcoDb): StoredRepo[] {
  return (db.raw.prepare('SELECT * FROM repos ORDER BY stars DESC').all() as unknown as RepoRow[]).map(toRepo);
}

export function repoIds(db: EcoDb): string[] {
  return (db.raw.prepare('SELECT id FROM repos ORDER BY id').all() as { id: string }[]).map((row) => row.id);
}

export function repoCount(db: EcoDb): number {
  const row = db.raw.prepare('SELECT COUNT(*) AS n FROM repos').get() as { n: number } | undefined;
  return row?.n ?? 0;
}

export function writeSnapshot(db: EcoDb, snapshot: SnapshotWrite, now = new Date().toISOString()): void {
  db.raw
    .prepare(
      `INSERT INTO snapshots (repo_id, scan_date, stars, npm_weekly, release_downloads, segment, segment_confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(repo_id, scan_date) DO UPDATE SET
         stars = excluded.stars,
         npm_weekly = excluded.npm_weekly,
         release_downloads = excluded.release_downloads,
         segment = excluded.segment,
         segment_confidence = excluded.segment_confidence`,
    )
    .run(
      normalizeRepoId(snapshot.repoId),
      snapshot.date,
      snapshot.stars,
      snapshot.npmWeekly,
      snapshot.releaseDownloads,
      snapshot.segment,
      snapshot.segmentConfidence,
      now,
    );
}

export function snapshotDates(db: EcoDb): string[] {
  return (db.raw.prepare('SELECT DISTINCT scan_date FROM snapshots ORDER BY scan_date').all() as { scan_date: string }[]).map(
    (row) => row.scan_date,
  );
}

export function latestSnapshotDate(db: EcoDb): string | null {
  const row = db.raw.prepare('SELECT MAX(scan_date) AS date FROM snapshots').get() as { date: string | null } | undefined;
  return row?.date ?? null;
}

export function snapshotCount(db: EcoDb): number {
  const row = db.raw.prepare('SELECT COUNT(*) AS n FROM snapshots').get() as { n: number } | undefined;
  return row?.n ?? 0;
}

export function snapshotsForDate(db: EcoDb, date: string): SnapshotRow[] {
  const rows = db.raw.prepare('SELECT * FROM snapshots WHERE scan_date = ? ORDER BY repo_id').all(date) as {
    id: number;
    repo_id: string;
    scan_date: string;
    stars: number;
    npm_weekly: number | null;
    release_downloads: number | null;
    segment: string;
    segment_confidence: number | null;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    repoId: row.repo_id,
    date: row.scan_date,
    stars: row.stars,
    npmWeekly: row.npm_weekly,
    releaseDownloads: row.release_downloads,
    segment: row.segment,
    segmentConfidence: row.segment_confidence,
    createdAt: row.created_at,
  }));
}

export function previousSnapshotDate(db: EcoDb, date: string): string | null {
  const row = db.raw.prepare('SELECT MAX(scan_date) AS date FROM snapshots WHERE scan_date < ?').get(date) as
    | { date: string | null }
    | undefined;
  return row?.date ?? null;
}

export function replaceSegments(db: EcoDb, repoId: string, labels: SegmentLabel[], now = new Date().toISOString()): void {
  const id = normalizeRepoId(repoId);
  transaction(db, () => {
    db.raw.prepare('DELETE FROM repo_segments WHERE repo_id = ?').run(id);
    const insert = db.raw.prepare(
      'INSERT INTO repo_segments (repo_id, segment, confidence, source, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const label of labels) insert.run(id, label.segment, label.confidence, label.source, now);
  });
}

export function segmentsForRepo(db: EcoDb, repoId: string): SegmentLabel[] {
  const rows = db.raw
    .prepare('SELECT segment, confidence, source FROM repo_segments WHERE repo_id = ? ORDER BY confidence DESC, segment')
    .all(normalizeRepoId(repoId)) as { segment: string; confidence: number; source: SegmentLabel['source'] }[];
  return rows.map((row) => ({ segment: row.segment, confidence: row.confidence, source: row.source }));
}

export function allSegments(db: EcoDb): Map<string, SegmentLabel[]> {
  const rows = db.raw
    .prepare('SELECT repo_id, segment, confidence, source FROM repo_segments ORDER BY repo_id, confidence DESC')
    .all() as { repo_id: string; segment: string; confidence: number; source: SegmentLabel['source'] }[];
  const map = new Map<string, SegmentLabel[]>();
  for (const row of rows) {
    const list = map.get(row.repo_id) ?? [];
    list.push({ segment: row.segment, confidence: row.confidence, source: row.source });
    map.set(row.repo_id, list);
  }
  return map;
}

export function writeSnapshotSegments(db: EcoDb, repoId: string, date: string, labels: SegmentLabel[]): void {
  const insert = db.raw.prepare(
    'INSERT OR REPLACE INTO snapshot_segments (repo_id, scan_date, segment, confidence) VALUES (?, ?, ?, ?)',
  );
  for (const label of labels) insert.run(normalizeRepoId(repoId), date, label.segment, label.confidence);
}

export function upsertNpmPackage(db: EcoDb, stat: NpmStat): void {
  db.raw
    .prepare(
      `INSERT INTO npm_packages (name, weekly_downloads, range_week, range_prev, growth_pct, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         weekly_downloads = excluded.weekly_downloads,
         range_week = excluded.range_week,
         range_prev = excluded.range_prev,
         growth_pct = excluded.growth_pct,
         fetched_at = excluded.fetched_at`,
    )
    .run(stat.name, stat.weekly, stat.weekly, stat.prev, stat.growthPct, stat.fetchedAt);
}

export function npmStat(db: EcoDb, name: string): NpmStat | null {
  const row = db.raw
    .prepare('SELECT name, weekly_downloads, range_week, range_prev, growth_pct, fetched_at FROM npm_packages WHERE name = ?')
    .get(name) as
    | {
        name: string;
        weekly_downloads: number;
        range_week: number | null;
        range_prev: number | null;
        growth_pct: number | null;
        fetched_at: string;
      }
    | undefined;
  if (!row) return null;
  return { name: row.name, weekly: row.weekly_downloads, prev: row.range_prev ?? 0, growthPct: row.growth_pct, fetchedAt: row.fetched_at };
}

export function npmCount(db: EcoDb): number {
  const row = db.raw.prepare('SELECT COUNT(*) AS n FROM npm_packages').get() as { n: number } | undefined;
  return row?.n ?? 0;
}

export function putMapping(db: EcoDb, row: MappingRow, now = new Date().toISOString()): void {
  db.raw
    .prepare(
      `INSERT INTO repo_npm_map (repo_id, npm_name, confidence, source, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(repo_id, npm_name) DO UPDATE SET
         confidence = excluded.confidence,
         source = excluded.source,
         updated_at = excluded.updated_at`,
    )
    .run(normalizeRepoId(row.repoId), row.npmName, row.confidence, row.source, now);
}

export function mappingsFor(db: EcoDb, repoId: string): MappingRow[] {
  const rows = db.raw
    .prepare('SELECT repo_id, npm_name, confidence, source FROM repo_npm_map WHERE repo_id = ? ORDER BY confidence DESC')
    .all(normalizeRepoId(repoId)) as { repo_id: string; npm_name: string; confidence: number; source: MappingRow['source'] }[];
  return rows.map((row) => ({ repoId: row.repo_id, npmName: row.npm_name, confidence: row.confidence, source: row.source }));
}

export function allMappings(db: EcoDb): MappingRow[] {
  const rows = db.raw.prepare('SELECT repo_id, npm_name, confidence, source FROM repo_npm_map').all() as {
    repo_id: string;
    npm_name: string;
    confidence: number;
    source: MappingRow['source'];
  }[];
  return rows.map((row) => ({ repoId: row.repo_id, npmName: row.npm_name, confidence: row.confidence, source: row.source }));
}

export function mappingCount(db: EcoDb): number {
  const row = db.raw.prepare('SELECT COUNT(*) AS n FROM repo_npm_map').get() as { n: number } | undefined;
  return row?.n ?? 0;
}

export function putOverride(db: EcoDb, repoId: string, segment: string, reason: string | null, now = new Date().toISOString()): void {
  db.raw
    .prepare(
      `INSERT INTO segment_overrides (repo_id, segment, reason, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(repo_id) DO UPDATE SET segment = excluded.segment, reason = excluded.reason, updated_at = excluded.updated_at`,
    )
    .run(normalizeRepoId(repoId), segment, reason, now);
}

export function overrides(db: EcoDb): Map<string, { segment: string; reason: string | null }> {
  const rows = db.raw.prepare('SELECT repo_id, segment, reason FROM segment_overrides').all() as {
    repo_id: string;
    segment: string;
    reason: string | null;
  }[];
  return new Map(rows.map((row) => [row.repo_id, { segment: row.segment, reason: row.reason }]));
}

export function deleteOverride(db: EcoDb, repoId: string): void {
  db.raw.prepare('DELETE FROM segment_overrides WHERE repo_id = ?').run(normalizeRepoId(repoId));
}

export function startScan(db: EcoDb, scanDate: string, now = new Date().toISOString()): number {
  const result = db.raw
    .prepare('INSERT INTO scans (scan_date, repo_count, duration_ms, status, error, stage, checkpoint, created_at) VALUES (?, 0, 0, ?, NULL, ?, ?, ?)')
    .run(scanDate, 'partial', 'start', '{}', now);
  return Number(result.lastInsertRowid);
}

export function updateScan(
  db: EcoDb,
  scanId: number,
  patch: { stage?: string; checkpoint?: Record<string, unknown>; repoCount?: number },
): void {
  const current = db.raw.prepare('SELECT stage, checkpoint, repo_count FROM scans WHERE id = ?').get(scanId) as
    | { stage: string; checkpoint: string; repo_count: number }
    | undefined;
  if (!current) return;
  db.raw
    .prepare('UPDATE scans SET stage = ?, checkpoint = ?, repo_count = ? WHERE id = ?')
    .run(
      patch.stage ?? current.stage,
      patch.checkpoint ? JSON.stringify(patch.checkpoint) : current.checkpoint,
      patch.repoCount ?? current.repo_count,
      scanId,
    );
}

export function finishScan(
  db: EcoDb,
  scanId: number,
  status: ScanStatus,
  repoCount: number,
  durationMs: number,
  error: string | null,
): void {
  db.raw
    .prepare('UPDATE scans SET status = ?, repo_count = ?, duration_ms = ?, error = ?, stage = ? WHERE id = ?')
    .run(status, repoCount, durationMs, error, 'done', scanId);
}

export function recordScanError(db: EcoDb, scanId: number, stage: string, message: string, now = new Date().toISOString()): void {
  db.raw
    .prepare('INSERT INTO scan_errors (scan_id, stage, message, created_at) VALUES (?, ?, ?, ?)')
    .run(scanId, stage, message.slice(0, 2000), now);
}

export function lastScan(db: EcoDb): ScanRecord | null {
  const row = db.raw.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 1').get() as ScanRow | undefined;
  return row ? toScan(row) : null;
}

interface ScanRow {
  id: number;
  scan_date: string;
  repo_count: number;
  duration_ms: number;
  status: ScanStatus;
  error: string | null;
  stage: string;
  checkpoint: string;
  created_at: string;
}

function toScan(row: ScanRow): ScanRecord {
  let checkpoint: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.checkpoint);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) checkpoint = parsed as Record<string, unknown>;
  } catch {
    checkpoint = {};
  }
  return {
    id: row.id,
    scanDate: row.scan_date,
    repoCount: row.repo_count,
    durationMs: row.duration_ms,
    status: row.status,
    error: row.error,
    stage: row.stage,
    checkpoint,
    createdAt: row.created_at,
  };
}

export function scanById(db: EcoDb, id: number): ScanRecord | null {
  const row = db.raw.prepare('SELECT * FROM scans WHERE id = ?').get(id) as ScanRow | undefined;
  return row ? toScan(row) : null;
}

export function getReleaseCache(
  db: EcoDb,
  repoId: string,
): { downloads: number | null; etag: string | null; fetchedAt: string } | null {
  const row = db.raw.prepare('SELECT downloads, etag, fetched_at FROM release_cache WHERE repo_id = ?').get(normalizeRepoId(repoId)) as
    | { downloads: number | null; etag: string | null; fetched_at: string }
    | undefined;
  return row ? { downloads: row.downloads, etag: row.etag, fetchedAt: row.fetched_at } : null;
}

export function putReleaseCache(
  db: EcoDb,
  repoId: string,
  downloads: number | null,
  etag: string | null,
  now = new Date().toISOString(),
): void {
  db.raw
    .prepare(
      `INSERT INTO release_cache (repo_id, downloads, etag, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(repo_id) DO UPDATE SET downloads = excluded.downloads, etag = excluded.etag, fetched_at = excluded.fetched_at`,
    )
    .run(normalizeRepoId(repoId), downloads, etag, now);
}

export function getEtag(db: EcoDb, key: string): { etag: string; body: string | null } | null {
  const row = db.raw.prepare('SELECT etag, body FROM etag_cache WHERE key = ?').get(key) as
    | { etag: string; body: string | null }
    | undefined;
  return row ?? null;
}

export function putEtag(db: EcoDb, key: string, etag: string, body: string | null, now = new Date().toISOString()): void {
  db.raw
    .prepare(
      `INSERT INTO etag_cache (key, etag, body, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET etag = excluded.etag, body = excluded.body, fetched_at = excluded.fetched_at`,
    )
    .run(key, etag, body, now);
}

export function recordAlert(
  db: EcoDb,
  ruleId: string,
  repoId: string,
  scanDate: string,
  payload: unknown,
  now = new Date().toISOString(),
): boolean {
  const result = db.raw
    .prepare(
      `INSERT INTO alert_events (rule_id, repo_id, scan_date, payload, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(rule_id, repo_id, scan_date) DO NOTHING`,
    )
    .run(ruleId, normalizeRepoId(repoId), scanDate, JSON.stringify(payload), now);
  return Number(result.changes) > 0;
}

export function errorsByStage(db: EcoDb, scanId: number): ErrorsByStage {
  const rows = db.raw.prepare('SELECT stage, message FROM scan_errors WHERE scan_id = ? ORDER BY id').all(scanId) as {
    stage: string;
    message: string;
  }[];
  const out: ErrorsByStage = {};
  for (const row of rows) (out[row.stage] ??= []).push(row.message);
  return out;
}

export function health(db: EcoDb, dbPath: string): HealthReport {
  const recent = db.raw
    .prepare(
      `SELECT s.scan_date AS scanDate, e.stage AS stage, e.message AS message
       FROM scan_errors e JOIN scans s ON s.id = e.scan_id ORDER BY e.id DESC LIMIT 10`,
    )
    .all() as { scanDate: string; stage: string; message: string }[];
  const schema = db.raw.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number | null } | undefined;
  return {
    dbPath,
    schemaVersion: schema?.version ?? 0,
    repos: repoCount(db),
    snapshots: snapshotCount(db),
    npmPackages: npmCount(db),
    mappings: mappingCount(db),
    lastScan: lastScan(db),
    dates: snapshotDates(db),
    recentErrors: recent,
  };
}

export function meta(db: EcoDb, key: string): string | null {
  return getMeta(db, key);
}

export function setMetaValue(db: EcoDb, key: string, value: string): void {
  setMeta(db, key, value);
}

/** Migration-only insert: keeps richer v2 facts when they already exist. */
export function upsertLegacyRepo(db: EcoDb, repoId: string, date: string, stars: number, now = new Date().toISOString()): void {
  db.raw
    .prepare(
      `INSERT INTO repos (id, description, stars, forks, open_issues, topics, created_at, pushed_at, archived, updated_at)
       VALUES (?, '', ?, 0, 0, '[]', ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET stars = MAX(repos.stars, excluded.stars)`,
    )
    .run(normalizeRepoId(repoId), stars, date, date, now);
}

/** Migration must never clobber a v2 snapshot taken the same day. */
export function writeSnapshotIfAbsent(db: EcoDb, snapshot: SnapshotWrite, now = new Date().toISOString()): boolean {
  const result = db.raw
    .prepare(
      `INSERT INTO snapshots (repo_id, scan_date, stars, npm_weekly, release_downloads, segment, segment_confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(repo_id, scan_date) DO NOTHING`,
    )
    .run(
      normalizeRepoId(snapshot.repoId),
      snapshot.date,
      snapshot.stars,
      snapshot.npmWeekly,
      snapshot.releaseDownloads,
      snapshot.segment,
      snapshot.segmentConfidence,
      now,
    );
  return Number(result.changes) > 0;
}

/** Replaces all mappings from the given sources in one transaction; manual and
 * registry rows are refreshed on every scan, heuristics are rebuilt from
 * scratch so a renamed package does not leave a stale pair behind. */
export function replaceMappings(db: EcoDb, rows: readonly MappingRow[], sources: readonly MappingRow['source'][]): void {
  transaction(db, () => {
    const placeholders = sources.map(() => '?').join(',');
    if (sources.length) db.raw.prepare(`DELETE FROM repo_npm_map WHERE source IN (${placeholders})`).run(...sources);
    for (const row of rows) putMapping(db, row);
  });
}

export function latestOpenScan(db: EcoDb, scanDate: string): ScanRecord | null {
  const row = db.raw
    .prepare("SELECT * FROM scans WHERE scan_date = ? AND status != 'ok' AND stage != 'done' ORDER BY id DESC LIMIT 1")
    .get(scanDate) as ScanRow | undefined;
  return row ? toScan(row) : null;
}
