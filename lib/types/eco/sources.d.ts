/** Data collection from the two real "downloads" surfaces the ecosystem has:
 *  - GitHub search API for repos in the dsh-plugin topics (stars, dates)
 *  - GitHub releases' asset download_count summed per repo
 *  - npm last-week downloads for packages matching dsh-plugin keywords
 * All fetches tolerate failure per-source: a dead source degrades that metric
 * to undefined instead of failing the scan. */
import { readTokenFromEnv, type FetchOptions } from '@dsh-family/kit/kit/http';
import { weekGrowth } from './growth.ts';
export { readTokenFromEnv };
export type { FetchOptions };
export interface RawRepo {
    full_name: string;
    description: string | null;
    stargazers_count: number;
    created_at: string;
    pushed_at: string;
}
/** Search both known topics; dedupe by full_name. */
export declare function fetchTopicRepos(options: FetchOptions): Promise<RawRepo[]>;
export declare function fetchReleaseDownloads(fullName: string, options: FetchOptions): Promise<number | undefined>;
/** npm weekly downloads for every published package whose name or keywords tie
 * it to the dsh plugin ecosystem. */
export declare function fetchNpmWeekly(keywords?: string[], options?: FetchOptions): Promise<Map<string, number>>;
export declare function fetchNpmRangeGrowth(names: string[], options?: FetchOptions): Promise<Map<string, {
    week: number;
    prev: number;
    growthPct: number | null;
}>>;
/** Thin alias so the eco source path and the growth engine share ONE 14-day
 * window rule. Previously this was a duplicate with a `< 8` guard, which let
 * an 8–13 day series divide a full week by a truncated 1–6 day "previous week". */
export declare const weekGrowthFrom: typeof weekGrowth;
//# sourceMappingURL=sources.d.ts.map