/** Persistence API over the v2 schema. Every write is an idempotent upsert so
 * a crashed scan can be resumed without duplicating rows. */
import type { EcoDb } from './db.ts';
import type { ErrorsByStage, HealthReport, MappingRow, NpmStat, RepoFacts, ScanRecord, ScanStatus, SegmentLabel, SnapshotRow, SnapshotWrite, StoredRepo } from './types.ts';
export declare function upsertRepo(db: EcoDb, facts: RepoFacts, now?: string): void;
export declare function upsertRepoDetails(db: EcoDb, facts: RepoFacts, now?: string): void;
export declare function getRepo(db: EcoDb, id: string): StoredRepo | null;
export declare function allRepos(db: EcoDb): StoredRepo[];
export declare function repoIds(db: EcoDb): string[];
export declare function repoCount(db: EcoDb): number;
export declare function writeSnapshot(db: EcoDb, snapshot: SnapshotWrite, now?: string): void;
export declare function snapshotDates(db: EcoDb): string[];
export declare function latestSnapshotDate(db: EcoDb): string | null;
export declare function snapshotCount(db: EcoDb): number;
export declare function snapshotsForDate(db: EcoDb, date: string): SnapshotRow[];
export declare function previousSnapshotDate(db: EcoDb, date: string): string | null;
export declare function replaceSegments(db: EcoDb, repoId: string, labels: SegmentLabel[], now?: string): void;
export declare function segmentsForRepo(db: EcoDb, repoId: string): SegmentLabel[];
export declare function allSegments(db: EcoDb): Map<string, SegmentLabel[]>;
export declare function writeSnapshotSegments(db: EcoDb, repoId: string, date: string, labels: SegmentLabel[]): void;
export declare function upsertNpmPackage(db: EcoDb, stat: NpmStat): void;
export declare function npmStat(db: EcoDb, name: string): NpmStat | null;
export declare function npmCount(db: EcoDb): number;
export declare function putMapping(db: EcoDb, row: MappingRow, now?: string): void;
export declare function mappingsFor(db: EcoDb, repoId: string): MappingRow[];
export declare function allMappings(db: EcoDb): MappingRow[];
export declare function mappingCount(db: EcoDb): number;
export declare function putOverride(db: EcoDb, repoId: string, segment: string, reason: string | null, now?: string): void;
export declare function overrides(db: EcoDb): Map<string, {
    segment: string;
    reason: string | null;
}>;
export declare function deleteOverride(db: EcoDb, repoId: string): void;
export declare function startScan(db: EcoDb, scanDate: string, now?: string): number;
export declare function updateScan(db: EcoDb, scanId: number, patch: {
    stage?: string;
    checkpoint?: Record<string, unknown>;
    repoCount?: number;
}): void;
export declare function finishScan(db: EcoDb, scanId: number, status: ScanStatus, repoCount: number, durationMs: number, error: string | null): void;
export declare function recordScanError(db: EcoDb, scanId: number, stage: string, message: string, now?: string): void;
export declare function lastScan(db: EcoDb): ScanRecord | null;
export declare function scanById(db: EcoDb, id: number): ScanRecord | null;
export declare function getReleaseCache(db: EcoDb, repoId: string): {
    downloads: number | null;
    etag: string | null;
    fetchedAt: string;
} | null;
export declare function putReleaseCache(db: EcoDb, repoId: string, downloads: number | null, etag: string | null, now?: string): void;
export declare function getEtag(db: EcoDb, key: string): {
    etag: string;
    body: string | null;
} | null;
export declare function putEtag(db: EcoDb, key: string, etag: string, body: string | null, now?: string): void;
export declare function recordAlert(db: EcoDb, ruleId: string, repoId: string, scanDate: string, payload: unknown, now?: string): boolean;
export declare function errorsByStage(db: EcoDb, scanId: number): ErrorsByStage;
export declare function health(db: EcoDb, dbPath: string): HealthReport;
export declare function meta(db: EcoDb, key: string): string | null;
export declare function setMetaValue(db: EcoDb, key: string, value: string): void;
/** Migration-only insert: keeps richer v2 facts when they already exist. */
export declare function upsertLegacyRepo(db: EcoDb, repoId: string, date: string, stars: number, now?: string): void;
/** Migration must never clobber a v2 snapshot taken the same day. */
export declare function writeSnapshotIfAbsent(db: EcoDb, snapshot: SnapshotWrite, now?: string): boolean;
/** Replaces all mappings from the given sources in one transaction; manual and
 * registry rows are refreshed on every scan, heuristics are rebuilt from
 * scratch so a renamed package does not leave a stale pair behind. */
export declare function replaceMappings(db: EcoDb, rows: readonly MappingRow[], sources: readonly MappingRow['source'][]): void;
export declare function latestOpenScan(db: EcoDb, scanDate: string): ScanRecord | null;
//# sourceMappingURL=storage.d.ts.map