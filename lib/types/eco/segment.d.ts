/** Market segmentation over dsh plugin repos. Keyword rules classify each repo
 * into one segment; rules are ordered, first match wins, and 'other' is the
 * explicit catch-all — an uncategorized repo is data, not an error. */
export interface EcoRepo {
    fullName: string;
    description: string;
    stars: number;
    createdAt: string;
    pushedAt: string;
    /** npm weekly downloads when the repo publishes a package we can find */
    npmWeekly?: number | undefined;
    /** release asset download counts summed */
    releaseDownloads?: number;
}
export type Segment = 'cost-budget' | 'telemetry-analytics' | 'memory-context' | 'ui-client' | 'tools-devx' | 'search-knowledge' | 'archive-export' | 'framework-runtime' | 'other';
export declare const SEGMENT_LABEL: Record<Segment, string>;
export declare function segmentOf(repo: EcoRepo): Segment;
export interface SegmentStat {
    segment: Segment;
    repos: number;
    stars: number;
    weeklyDownloads: number;
    medianStars: number;
}
export declare function segmentStats(repos: EcoRepo[]): SegmentStat[];
export declare function renderSegments(stats: SegmentStat[]): string;
//# sourceMappingURL=segment.d.ts.map