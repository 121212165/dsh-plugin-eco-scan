/** Release collector: sums every asset download_count across ALL releases
 * (v1 only read the first 20). Page 1 is revalidated with ETag; pages beyond
 * it are cheap because release lists are small. */
import type { HttpClient } from '../http.ts';
import { githubHeaders } from '../http.ts';
import { asNumber, mapLimit } from '../util.ts';

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

export async function fetchReleaseDownloads(
  http: HttpClient,
  repoId: string,
  options: ReleaseOptions = {},
): Promise<ReleaseResult> {
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 100));
  const maxPages = Math.max(1, options.maxPages ?? 10);
  let total = 0;
  let seen = 0;
  let etag: string | null = null;
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/repos/${repoId}/releases?per_page=${perPage}&page=${page}`;
    const { data, result } = await http.json<unknown>(url, {
      headers: githubHeaders(options.token),
      ...(page === 1 && options.etag ? { etag: options.etag } : {}),
    });
    if (page === 1 && result.notModified) {
      return { downloads: null, etag: result.etag ?? options.etag ?? null, notModified: true, pages: 1 };
    }
    if (page === 1) etag = result.etag;
    if (!Array.isArray(data)) throw new Error(`unexpected releases payload for ${repoId}`);
    if (!data.length) break;
    for (const release of data) {
      if (!release || typeof release !== 'object') continue;
      const assets = (release as { assets?: unknown }).assets;
      if (!Array.isArray(assets)) continue;
      for (const asset of assets) {
        if (!asset || typeof asset !== 'object') continue;
        const count = asNumber((asset as { download_count?: unknown }).download_count);
        if (count !== null) {
          total += count;
          seen++;
        }
      }
    }
    if (data.length < perPage) break;
    if (page === maxPages) return { downloads: seen ? total : 0, etag, notModified: false, pages: page };
  }
  return { downloads: seen ? total : 0, etag, notModified: false, pages: maxPages };
}

export interface ReleaseBatchEntry {
  repoId: string;
  downloads: number | null;
  error: string | null;
}

export async function fetchReleaseBatch(
  http: HttpClient,
  repoIds: readonly string[],
  options: { token?: string; concurrency?: number; maxPages?: number; log?: (message: string) => void } = {},
): Promise<ReleaseBatchEntry[]> {
  const results = await mapLimit(repoIds, options.concurrency ?? 4, async (repoId) => {
    const result = await fetchReleaseDownloads(http, repoId, {
      ...(options.token ? { token: options.token } : {}),
      ...(options.maxPages ? { maxPages: options.maxPages } : {}),
    });
    return { repoId, downloads: result.downloads, error: null } satisfies ReleaseBatchEntry;
  });
  const out: ReleaseBatchEntry[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') out.push(result.value);
    else out.push({ repoId: repoIds[index] ?? '?', downloads: null, error: String(result.reason) });
  });
  options.log?.(`releases ${out.filter((entry) => entry.error === null).length}/${repoIds.length} ok`);
  return out;
}
