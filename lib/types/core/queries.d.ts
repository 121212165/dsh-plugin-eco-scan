/** Read-only query layer. Everything the commands/tools show is derived here
 * from the snapshots table, so scores are recomputable and auditable rather
 * than being opaque numbers written by a previous run. */
import type { EcoDb } from './db.ts';
import type { DiffRow, OverviewRow, StoredRepo, TopRow } from './types.ts';
import { type ScoreResult } from './scoring.ts';
export interface ScoredSet {
    date: string | null;
    previousDate: string | null;
    scores: ScoreResult[];
}
export declare function scoredSet(db: EcoDb, date?: string, now?: Date): ScoredSet;
export declare function topRows(db: EcoDb, options?: {
    segment?: string | null;
    limit?: number;
    date?: string;
    includeInsufficient?: boolean;
}): {
    date: string | null;
    rows: TopRow[];
};
export declare function diffRows(db: EcoDb, toDate?: string, fromDate?: string): {
    from: string | null;
    to: string | null;
    rows: DiffRow[];
};
export declare function overview(db: EcoDb, date?: string): {
    date: string | null;
    rows: OverviewRow[];
    totalRepos: number;
    mapped: number;
};
export declare function unmatchedRepos(db: EcoDb): StoredRepo[];
export interface SqlResult {
    columns: string[];
    rows: Record<string, unknown>[];
    truncated: boolean;
}
export declare class UnsafeQueryError extends Error {
    constructor(message: string);
}
/** Defence in depth: strip comments, allow a single SELECT/WITH statement, and
 * wrap it in a subquery so SQLite itself rejects any write. */
export declare function assertReadOnlySql(sql: string): string;
export declare function queryReadOnly(db: EcoDb, sql: string, limit?: number): SqlResult;
export interface SnapshotExportRow {
    repoId: string;
    stars: number;
    npmWeekly: number | null;
    releaseDownloads: number | null;
    segment: string;
    segmentConfidence: number | null;
    npmRangeWeek: number | null;
    npmRangePrev: number | null;
}
/** Every snapshot of one day with the v1 audit fields plus the v2 additions
 * (segment confidence and both weeks of the npm range), so a JSONL dump can
 * rebuild the store without re-hitting the network. */
export declare function snapshotExportRows(db: EcoDb, date: string): SnapshotExportRow[];
export declare function coverage(db: EcoDb): {
    repos: number;
    mapped: number;
    withWeekly: number;
    withReleases: number;
};
export declare function scoreSummary(rows: readonly ScoreResult[]): {
    median: number;
    outliers: number;
    insufficient: number;
};
//# sourceMappingURL=queries.d.ts.map