/** npm collector: package discovery through the registry search index (which
 * also exposes each package's repository URL — a zero-guess mapping) and
 * 14-day download ranges that yield both this week and last week, so growth
 * needs no second call. */
import type { HttpClient } from '../http.ts';
import type { NpmStat } from '../types.ts';
export interface NpmPackageInfo {
    name: string;
    repository: string | null;
    keywords: string[];
    version: string | null;
    /** Weekly downloads reported by the search index itself, so a package
     * always has a weekly figure even when the download API is unavailable. */
    weekly: number | null;
}
export interface NpmSearchOptions {
    keywords?: readonly string[];
    pageSize?: number;
    maxPages?: number;
    maxPackages?: number;
    log?: (message: string) => void;
}
export interface NpmSearchResult {
    packages: NpmPackageInfo[];
    errors: string[];
}
export declare function searchPackages(http: HttpClient, options?: NpmSearchOptions): Promise<NpmSearchResult>;
export interface DownloadOptions {
    concurrency?: number;
    bulkConcurrency?: number;
    now?: Date;
    /** Weekly counts already reported by the search index, keyed by package. */
    knownWeekly?: ReadonlyMap<string, number>;
    /** Cap on per-package scoped range calls. Scoped names cannot be bulk
     * looked up, and one request per name does not scale past a few hundred. */
    scopedBudget?: number;
    log?: (message: string) => void;
}
export interface DownloadWindows {
    week: {
        start: string;
        end: string;
    };
    prev: {
        start: string;
        end: string;
    };
}
/** Two disjoint 7-day windows ending yesterday. `week` is the newest week and
 * `prev` the one before it, matching what `weekGrowthFrom` derives from a
 * 14-day range. */
export declare function downloadWindows(now?: Date): DownloadWindows;
export declare function rangeWindow(now?: Date): {
    since: string;
    until: string;
};
export declare function weekGrowthFrom(daily: number[]): {
    week: number;
    prev: number;
    growthPct: number | null;
};
export interface DownloadResult {
    stats: Map<string, NpmStat>;
    errors: string[];
}
/** Fetch weekly and previous-week download totals without one request per
 * package: unscoped names ride the bulk point endpoint (two calls per chunk),
 * and scoped names — which npm refuses in bulk lookups — reuse the search
 * index's weekly count, spending the range budget on the biggest packages
 * first. Missing `prev` means growth is honestly unknown (insufficient), not
 * zero. Per-chunk and per-package failures are returned so the caller can
 * report a degraded run instead of silently storing nothing. */
export declare function fetchDownloadStats(http: HttpClient, names: readonly string[], options?: DownloadOptions): Promise<DownloadResult>;
//# sourceMappingURL=npm.d.ts.map