/** Growth math over snapshot series. A snapshot is one observation per repo per
 * scan date. Growth is judged on whichever metric has history: npm weekly
 * downloads and release downloads are the "downloads" signal the ecosystem
 * actually exposes (GitHub has no repo-level downloads); stars are the
 * awareness signal. Score blends level and velocity so a big repo growing 1%
 * doesn't outrank a small one growing 300%. */
export interface SnapshotPoint {
    date: string;
    stars: number;
    npmWeekly?: number;
    releaseDownloads?: number;
}
export interface RepoSeries {
    fullName: string;
    segment: string;
    points: SnapshotPoint[];
}
export interface GrowthRow {
    fullName: string;
    segment: string;
    stars: number;
    /** metric used for growth judgment */
    metric: 'npmWeekly' | 'releaseDownloads' | 'stars';
    latest: number;
    previous: number | null;
    delta: number | null;
    growthPct: number | null;
    /** days between the two compared snapshots */
    spanDays: number | null;
    /** composite: growthPct weighted by sqrt(latest) so size matters but is dominated by velocity */
    score: number;
}
export declare function growthRow(series: RepoSeries): GrowthRow;
export declare function rankGrowth(series: RepoSeries[], limit?: number): GrowthRow[];
export declare function renderGrowth(rows: GrowthRow[]): string;
export declare function renderSegmentsGrowth(rows: GrowthRow[]): string;
/** npm range-API backfill: last-7-day sum vs the 7 days before it.
 * Needs a full 14-day window; with fewer samples the "previous week" slice
 * would be truncated, so growthPct is null instead of a wrong ratio. */
export declare function weekGrowth(daily: number[]): {
    week: number;
    prev: number;
    growthPct: number | null;
};
export interface LiveGrowthRow {
    fullName: string;
    segment: string;
    week: number;
    prev: number;
    growthPct: number | null;
    score: number;
}
export declare function rankLiveGrowth(rows: LiveGrowthRow[], limit?: number): LiveGrowthRow[];
export declare function renderLiveGrowth(rows: LiveGrowthRow[]): string;
//# sourceMappingURL=growth.d.ts.map