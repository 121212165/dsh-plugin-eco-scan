/** Growth math over snapshot series. A snapshot is one observation per repo per
 * scan date. Growth is judged on whichever metric has history: npm weekly
 * downloads and release downloads are the "downloads" signal the ecosystem
 * actually exposes (GitHub has no repo-level downloads); stars are the
 * awareness signal. Score blends level and velocity so a big repo growing 1%
 * doesn't outrank a small one growing 300%. */

export interface SnapshotPoint {
  date: string; // YYYY-MM-DD
  stars: number;
  npmWeekly?: number;
  releaseDownloads?: number;
}

export interface RepoSeries {
  fullName: string;
  segment: string;
  points: SnapshotPoint[]; // ascending by date, may be a single point
}

export interface GrowthRow {
  fullName: string;
  segment: string;
  stars: number;
  /** metric used for growth judgment */
  metric: 'npmWeekly' | 'releaseDownloads' | 'stars';
  latest: number;
  previous: number | null; // nearest earlier snapshot
  delta: number | null;
  growthPct: number | null; // delta / previous, null when previous is 0/absent
  /** days between the two compared snapshots */
  spanDays: number | null;
  /** composite: growthPct weighted by sqrt(latest) so size matters but is dominated by velocity */
  score: number;
}

export function growthRow(series: RepoSeries): GrowthRow {
  const points = [...series.points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const latestPoint = points[points.length - 1]!;
  const metric: GrowthRow['metric'] =
    latestPoint.npmWeekly !== undefined ? 'npmWeekly' : latestPoint.releaseDownloads !== undefined ? 'releaseDownloads' : 'stars';
  const latest = (latestPoint.npmWeekly ?? latestPoint.releaseDownloads ?? latestPoint.stars) as number;
  let previousPoint: SnapshotPoint | null = null;
  for (let index = points.length - 2; index >= 0; index--) {
    const candidate = points[index]!;
    if ((candidate.npmWeekly ?? candidate.releaseDownloads ?? candidate.stars) !== undefined) {
      previousPoint = candidate;
      break;
    }
  }
  const previous = previousPoint ? ((previousPoint.npmWeekly ?? previousPoint.releaseDownloads ?? previousPoint.stars) as number) : null;
  const delta = previous === null ? null : latest - previous;
  const growthPct = previous !== null && previous > 0 ? delta! / previous : null;
  const spanDays = previousPoint ? Math.max(1, Math.round((Date.parse(latestPoint.date) - Date.parse(previousPoint.date)) / 86_400_000)) : null;
  const score = growthPct === null ? 0 : Math.max(0, growthPct) * Math.sqrt(Math.max(1, latest));
  return { fullName: series.fullName, segment: series.segment, stars: latestPoint.stars, metric, latest, previous, delta, growthPct, spanDays, score };
}

export function rankGrowth(series: RepoSeries[], limit = 15): GrowthRow[] {
  return series
    .map(growthRow)
    .filter((row) => row.growthPct !== null && row.growthPct > 0) // high-growth ranking only
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function renderGrowth(rows: GrowthRow[]): string {
  if (!rows.length) return '还没有可比较的历史快照。明天再扫一次，差值就有意义了。';
  const lines = rows.map((row) => {
    const pct = row.growthPct === null ? '?' : `${row.growthPct >= 0 ? '+' : ''}${Math.round(row.growthPct * 100)}%`;
    const span = row.spanDays === null ? '?' : `${row.spanDays}d`;
    return `  ${row.fullName.padEnd(40)} ${String(row.latest).padStart(8)} ${pct.padStart(7)} (${span}) ${row.segment}`;
  });
  return lines.join('\n');
}

export function renderSegmentsGrowth(rows: GrowthRow[]): string {
  // aggregate per segment: median growth across rows that have growth
  const withGrowth = rows.filter((row) => row.growthPct !== null);
  const bySegment = new Map<string, number[]>();
  for (const row of withGrowth) {
    const list = bySegment.get(row.segment) ?? [];
    list.push(row.growthPct!);
    bySegment.set(row.segment, list);
  }
  const stats = [...bySegment.entries()]
    .map(([segment, pcts]) => {
      const sorted = [...pcts].sort((a, b) => a - b);
      const median = sorted.length % 2 ? sorted[(sorted.length - 1) >> 1]! : (sorted[sorted.length >> 1]! + (sorted[(sorted.length >> 1) - 1] ?? 0)) / 2;
      return { segment, median, count: sorted.length };
    })
    .sort((a, b) => b.median - a.median);
  if (!stats.length) return '细分赛道还没有增长数据。';
  return stats.map((stat) => `  ${stat.segment.padEnd(22)} 中位增长 ${(stat.median * 100).toFixed(1)}%（${stat.count} 个插件）`).join('\n');
}

/** npm range-API backfill: last-7-day sum vs the 7 days before it. */
export function weekGrowth(daily: number[]): { week: number; prev: number; growthPct: number | null } {
  if (daily.length < 8) return { week: daily.reduce((a, b) => a + b, 0), prev: 0, growthPct: null };
  const week = daily.slice(-7).reduce((a, b) => a + b, 0);
  const prev = daily.slice(-14, -7).reduce((a, b) => a + b, 0);
  return { week, prev, growthPct: prev > 0 ? (week - prev) / prev : null };
}

export interface LiveGrowthRow {
  fullName: string;
  segment: string;
  week: number;
  prev: number;
  growthPct: number | null;
  score: number;
}

export function rankLiveGrowth(rows: LiveGrowthRow[], limit = 15): LiveGrowthRow[] {
  return rows
    .filter((row) => row.growthPct !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function renderLiveGrowth(rows: LiveGrowthRow[]): string {
  if (!rows.length) return 'npm 侧本周没有正增长样本。';
  const lines = rows.map((row) => {
    const pct = `${row.growthPct! >= 0 ? '+' : ''}${Math.round(row.growthPct! * 100)}%`;
    return `  ${row.fullName.padEnd(40)} 周 ${String(row.week).padStart(7)} vs ${String(row.prev).padStart(7)}  ${pct.padStart(7)}  ${row.segment}`;
  });
  return lines.join('\n');
}
