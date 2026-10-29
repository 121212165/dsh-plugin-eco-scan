/** Release collector: sums every asset download_count across ALL releases
 * (v1 only read the first 20). Page 1 is revalidated with ETag; pages beyond
 * it are cheap because release lists are small. */
import type { HttpClient } from '../http.ts';
export interface ReleaseOptions {
    token?: string;
    etag?: string | null;
    maxPages?: number;
    perPage?: number;
}
export interface ReleaseResult {
    downloads: number | null;
    etag: string | null;
    notModified: boolean;
    pages: number;
    error?: string;
}
export declare function fetchReleaseDownloads(http: HttpClient, repoId: string, options?: ReleaseOptions): Promise<ReleaseResult>;
export interface ReleaseBatchEntry {
    repoId: string;
    downloads: number | null;
    error: string | null;
}
export declare function fetchReleaseBatch(http: HttpClient, repoIds: readonly string[], options?: {
    token?: string;
    concurrency?: number;
    maxPages?: number;
    log?: (message: string) => void;
}): Promise<ReleaseBatchEntry[]>;
//# sourceMappingURL=releases.d.ts.map