/** v1 → v2 migration. Reads every `snapshots-YYYY-MM.jsonl` in the v1 data
 * directory and writes repos + snapshots idempotently (INSERT … DO NOTHING),
 * so running it twice or alongside live v2 scans cannot corrupt history. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { EcoDb } from './db.ts';
import { meta, replaceSegments, setMetaValue, upsertLegacyRepo, writeSnapshotIfAbsent } from './storage.ts';
import { isRecord, normalizeRepoId } from './util.ts';

export interface MigrateResult {
  files: number;
  records: number;
  skipped: number;
  repos: number;
  dates: number;
  alreadyMigrated: boolean;
}

interface V1Record {
  date: string;
  fullName: string;
  segment: string;
  stars: number;
  npmWeekly: number | null;
  releaseDownloads: number | null;
}

export function v1Files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^snapshots-\d{4}-\d{2}\.jsonl$/.test(name))
    .sort()
    .map((name) => join(dir, name));
}

export function parseV1Line(line: string): V1Record | null {
  if (!line.trim()) return null;
  try {
    const value: unknown = JSON.parse(line);
    if (!isRecord(value)) return null;
    if (value.v !== 1) return null;
    if (typeof value.date !== 'string' || typeof value.fullName !== 'string' || typeof value.stars !== 'number') return null;
    return {
      date: value.date,
      fullName: value.fullName,
      segment: typeof value.segment === 'string' && value.segment ? value.segment : 'other',
      stars: value.stars,
      npmWeekly: typeof value.npmWeekly === 'number' ? value.npmWeekly : null,
      releaseDownloads: typeof value.releaseDownloads === 'number' ? value.releaseDownloads : null,
    };
  } catch {
    return null;
  }
}

export function migrateV1(db: EcoDb, v1Dir: string, options: { force?: boolean } = {}): MigrateResult {
  const marker = meta(db, 'v1-migrated-at');
  if (marker && !options.force) {
    return { files: 0, records: 0, skipped: 0, repos: 0, dates: 0, alreadyMigrated: true };
  }
  const files = v1Files(v1Dir);
  const dates = new Set<string>();
  const repos = new Set<string>();
  const lastSegment = new Map<string, string>();
  let records = 0;
  let skipped = 0;
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const record = parseV1Line(line);
      if (!record) {
        if (line.trim()) skipped++;
        continue;
      }
      records++;
      const repoId = normalizeRepoId(record.fullName);
      repos.add(repoId);
      dates.add(record.date);
      upsertLegacyRepo(db, repoId, record.date, record.stars);
      writeSnapshotIfAbsent(db, {
        repoId,
        date: record.date,
        stars: record.stars,
        npmWeekly: record.npmWeekly,
        releaseDownloads: record.releaseDownloads,
        segment: record.segment,
        segmentConfidence: null,
      });
      lastSegment.set(repoId, record.segment);
    }
  }
  // v2 labels win: migration backfills classification only for repos that the
  // new scanner has never labelled, otherwise importing old history after a
  // v2 scan would silently downgrade today's multi-label rows to one legacy id.
  const classified = new Set(
    (db.raw.prepare('SELECT DISTINCT repo_id FROM repo_segments').all() as unknown as { repo_id: string }[]).map((row) => row.repo_id),
  );
  for (const [repoId, segment] of lastSegment) {
    if (classified.has(repoId)) continue;
    replaceSegments(db, repoId, [{ segment, confidence: 0.5, source: 'legacy' }]);
  }
  setMetaValue(db, 'v1-migrated-at', new Date().toISOString());
  setMetaValue(db, 'v1-migrated-dir', v1Dir);
  return { files: files.length, records, skipped, repos: repos.size, dates: dates.size, alreadyMigrated: false };
}
