/** GitHub collector. GraphQL is the primary path: cursor pagination past the
 * 1,000-result REST window per query, several corpus queries (topics, names,
 * description terms) for coverage, and a single batched detail query per 25
 * repos (CI workflows, test trees, contributor count, recent issue close
 * times). REST is a fallback that still works without a token.
 *
 * Note on ETag: GitHub's GraphQL endpoint is POST-only and does not emit
 * validators, so conditional requests apply to REST paths (search fallback,
 * releases). Detail staleness on the GraphQL path is handled with a TTL. */
import type { HttpClient } from '../http.ts';
import type { RepoFacts } from '../types.ts';
export declare const CORPUS_QUERIES: readonly ['topic:dsh-plugin', 'topic:dsh-plugins', 'dsh-plugin in:name', 'dsh-plugins in:name', 'deepseek-harness', 'cordis plugin in:description'];
export interface GithubOptions {
    token?: string;
    queries?: readonly string[];
    pageSize?: number;
    maxPagesPerQuery?: number;
    maxRepos?: number;
    detailBatchSize?: number;
    /** Minimum gap between REST search calls. Defaults to 2s with a token
     * (30 searches/min) and 6.5s without one (10/min). */
    restPacingMs?: number;
    sleep?: (ms: number) => Promise<void>;
    log?: (message: string) => void;
}
export interface CorpusResult {
    repos: RepoFacts[];
    complete: boolean;
    via: 'graphql' | 'rest';
    errors: string[];
}
/** Collect the repository corpus via GraphQL. Returns complete=false when a
 * query hit its page cap, so the caller can label coverage honestly. */
export declare function fetchCorpusGraphql(http: HttpClient, options: GithubOptions): Promise<CorpusResult>;
/** Batched details for the repos that still need CI/tests/contributors. */
export declare function enrichDetails(http: HttpClient, repos: RepoFacts[], options: GithubOptions & {
    ttlHint?: (repo: RepoFacts) => boolean;
}): Promise<{
    enriched: number;
    errors: string[];
}>;
/** REST fallback: search API caps at 1,000 items and returns no CI/test facts,
 * but it works with or without a token and supports ETag revalidation. Calls
 * are paced to the search rate limit; when the response says the quota is
 * nearly spent, it waits for the reset instead of collecting 403s. */
export declare function fetchCorpusRest(http: HttpClient, options: GithubOptions): Promise<CorpusResult>;
/** Corpus with graceful degradation: GraphQL first, REST on failure.
 * Repos already in the DB are always unioned in by the caller. */
export declare function fetchCorpus(http: HttpClient, options: GithubOptions): Promise<CorpusResult>;
export declare function errorText(error: unknown): string;
//# sourceMappingURL=github.d.ts.map