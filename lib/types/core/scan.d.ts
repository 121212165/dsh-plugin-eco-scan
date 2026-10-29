import type { EcoDb } from './db.ts';
import type { HttpClient } from './http.ts';
import { type EcoPaths } from './defaults.ts';
import type { OverviewRow, ScanStatus, TopRow } from './types.ts';
export interface ScanOptions {
    token?: string | undefined;
    dataDir?: string | undefined;
    now?: Date;
    http?: HttpClient;
    log?: (message: string) => void;
    resume?: boolean;
    maxRepos?: number;
    releaseBudget?: number;
    detailsTtlHours?: number;
    releaseTtlHours?: number;
    skipReleases?: boolean;
    awesomePath?: string | null;
    manualMappingText?: string;
    restPacingMs?: number;
    topN?: number;
}
export interface ScanReport {
    scanId: number;
    date: string;
    status: ScanStatus;
    durationMs: number;
    resumed: boolean;
    repos: number;
    npmPackages: number;
    mappings: number;
    unmatched: number;
    ambiguous: number;
    corpusComplete: boolean;
    via: string;
    coverage: {
        repos: number;
        mapped: number;
        withWeekly: number;
        withReleases: number;
    };
    errors: string[];
    segments: OverviewRow[];
    top: TopRow[];
    paths: EcoPaths;
}
export declare function runScan(db: EcoDb, options?: ScanOptions): Promise<ScanReport>;
/** Human summary used by the command surface and the tool's text render. */
export declare function renderScanReport(report: ScanReport): string;
//# sourceMappingURL=scan.d.ts.map