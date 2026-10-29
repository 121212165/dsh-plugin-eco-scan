import { snapshotDates } from './storage.js';
export function lastSnapshotDates(db, limit = 12) {
    const all = snapshotDates(db);
    return all.slice(Math.max(0, all.length - Math.max(1, limit)));
}
export function repoSeries(db, repoIds, dates) {
    const series = new Map();
    if (!repoIds.length || !dates.length)
        return series;
    const rows = db.raw
        .prepare(`SELECT repo_id, scan_date, stars, npm_weekly FROM snapshots
       WHERE repo_id IN (${repoIds.map(() => '?').join(',')})
         AND scan_date IN (${dates.map(() => '?').join(',')})
       ORDER BY scan_date`)
        .all(...repoIds, ...dates);
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
export function segmentHeatmap(db, options = {}) {
    const dates = lastSnapshotDates(db, options.dates ?? 12);
    const empty = { dates, segments: [], values: new Map(), totals: new Map() };
    if (!dates.length)
        return empty;
    const rows = db.raw
        .prepare(`SELECT s.scan_date AS date, COALESCE(ss.segment, s.segment) AS segment_label,
              SUM(s.npm_weekly) AS weekly
       FROM snapshots s
       LEFT JOIN snapshot_segments ss ON ss.repo_id = s.repo_id AND ss.scan_date = s.scan_date
       WHERE s.scan_date IN (${dates.map(() => '?').join(',')})
       GROUP BY s.scan_date, segment_label`)
        .all(...dates);
    const bySegment = new Map();
    for (const row of rows) {
        const cells = bySegment.get(row.segment_label) ?? new Map();
        cells.set(row.date, row.weekly === null ? null : Number(row.weekly));
        bySegment.set(row.segment_label, cells);
    }
    const totals = new Map();
    for (const [segment, cells] of bySegment) {
        const latest = dates[dates.length - 1];
        totals.set(segment, cells.get(latest) ?? 0);
    }
    const segments = [...bySegment.keys()]
        .sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || a.localeCompare(b))
        .slice(0, Math.max(1, options.limit ?? 8));
    const values = new Map();
    for (const segment of segments) {
        const cells = bySegment.get(segment);
        values.set(segment, dates.map((date) => cells?.get(date) ?? null));
    }
    return { dates, segments, values, totals };
}
//# sourceMappingURL=history.js.map