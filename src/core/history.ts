/** Time-series reads for the panel. Both are bounded by the number of snapshot
 * dates rather than the repo count: sparklines only need the top-N repos, and
 * the heatmap aggregates per segment per date in SQL. */
import type { EcoDb } from './db.ts';
import { snapshotDates } from './storage.ts';

export interface RepoPoint {
  date: string;
  stars: number;
  weekly: number | null;
}

export interface SegmentHeatmap {
  dates: string[];
  /** strongest segments first, capped by the caller's limit */
  segments: string[];
  /** weekly downloads aligned with `dates`; null = the segment had no snapshot that day */
  values: Map<string, (number | null)[]>;
  totals: Map<string, number>;
}

export function lastSnapshotDates(db: EcoDb, limit = 12): string[] {
  const all = snapshotDates(db);
  return all.slice(Math.max(0, all.length - Math.max(1, limit)));
}

export function repoSeries(db: EcoDb, repoIds: readonly string[], dates: readonly string[]): Map<string, RepoPoint[]> {
  const series = new Map<string, RepoPoint[]>();
  if (!repoIds.length || !dates.length) return series;
  const rows = db.raw
    .prepare(
      `SELECT repo_id, scan_date, stars, npm_weekly FROM snapshots
       WHERE repo_id IN (${repoIds.map(() => '?').join(',')})
         AND scan_date IN (${dates.map(() => '?').join(',')})
       ORDER BY scan_date`,
    )
    .all(...repoIds, ...dates) as unknown as { repo_id: string; scan_date: string; stars: number; npm_weekly: number | null }[];
  for (const row of rows) {
    const list = series.get(row.repo_id) ?? [];
    list.push({ date: row.scan_date, stars: row.stars, weekly: row.npm_weekly });
    series.set(row.repo_id, list);
  }
  return series;
}

/** Segment × date weekly downloads. Multi-label repos count once per label,
 * matching `overview()`; the LEFT JOIN falls back to the snapshot's primary
 * segment for rows written before `snapshot_segments` existed. */
export function segmentHeatmap(db: EcoDb, options: { limit?: number; dates?: number } = {}): SegmentHeatmap {
  const dates = lastSnapshotDates(db, options.dates ?? 12);
  const empty: SegmentHeatmap = { dates, segments: [], values: new Map(), totals: new Map() };
  if (!dates.length) return empty;
  const rows = db.raw
    .prepare(
      `SELECT s.scan_date AS date, COALESCE(ss.segment, s.segment) AS segment_label,
              SUM(s.npm_weekly) AS weekly
       FROM snapshots s
       LEFT JOIN snapshot_segments ss ON ss.repo_id = s.repo_id AND ss.scan_date = s.scan_date
       WHERE s.scan_date IN (${dates.map(() => '?').join(',')})
       GROUP BY s.scan_date, segment_label`,
    )
    .all(...dates) as unknown as { date: string; segment_label: string; weekly: number | null }[];

  const bySegment = new Map<string, Map<string, number | null>>();
  for (const row of rows) {
    const cells = bySegment.get(row.segment_label) ?? new Map<string, number | null>();
    cells.set(row.date, row.weekly === null ? null : Number(row.weekly));
    bySegment.set(row.segment_label, cells);
  }
  const totals = new Map<string, number>();
  for (const [segment, cells] of bySegment) {
    const latest = dates[dates.length - 1] as string;
    totals.set(segment, cells.get(latest) ?? 0);
  }
  const segments = [...bySegment.keys()]
    .sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, Math.max(1, options.limit ?? 8));
  const values = new Map<string, (number | null)[]>();
  for (const segment of segments) {
    const cells = bySegment.get(segment);
    values.set(segment, dates.map((date) => cells?.get(date) ?? null));
  }
  return { dates, segments, values, totals };
}
