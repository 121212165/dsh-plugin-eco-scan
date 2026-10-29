/** Time-series reads for the panel. Both are bounded by the number of snapshot
 * dates rather than the repo count: sparklines only need the top-N repos, and
 * the heatmap aggregates per segment per date in SQL. */
import type { EcoDb } from './db.ts';
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
export declare function lastSnapshotDates(db: EcoDb, limit?: number): string[];
export declare function repoSeries(db: EcoDb, repoIds: readonly string[], dates: readonly string[]): Map<string, RepoPoint[]>;
/** Segment × date weekly downloads. Multi-label repos count once per label,
 * matching `overview()`; the LEFT JOIN falls back to the snapshot's primary
 * segment for rows written before `snapshot_segments` existed. */
export declare function segmentHeatmap(db: EcoDb, options?: {
    limit?: number;
    dates?: number;
}): SegmentHeatmap;
//# sourceMappingURL=history.d.ts.map