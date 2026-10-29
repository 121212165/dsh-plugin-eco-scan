import { githubHeaders } from '../http.js';
import { asNumber, mapLimit } from '../util.js';
export async function fetchReleaseDownloads(http, repoId, options = {}) {
    const perPage = Math.min(100, Math.max(1, options.perPage ?? 100));
    const maxPages = Math.max(1, options.maxPages ?? 10);
    let total = 0;
    let seen = 0;
    let etag = null;
    for (let page = 1; page <= maxPages; page++) {
        const url = `https://api.github.com/repos/${repoId}/releases?per_page=${perPage}&page=${page}`;
        const { data, result } = await http.json(url, {
            headers: githubHeaders(options.token),
            ...(page === 1 && options.etag ? { etag: options.etag } : {}),
        });
        if (page === 1 && result.notModified) {
            return { downloads: null, etag: result.etag ?? options.etag ?? null, notModified: true, pages: 1 };
        }
        if (page === 1)
            etag = result.etag;
        if (!Array.isArray(data))
            throw new Error(`unexpected releases payload for ${repoId}`);
        if (!data.length)
            break;
        for (const release of data) {
            if (!release || typeof release !== 'object')
                continue;
            const assets = release.assets;
            if (!Array.isArray(assets))
                continue;
            for (const asset of assets) {
                if (!asset || typeof asset !== 'object')
                    continue;
                const count = asNumber(asset.download_count);
                if (count !== null) {
                    total += count;
                    seen++;
                }
            }
        }
        if (data.length < perPage)
            break;
        if (page === maxPages)
            return { downloads: seen ? total : 0, etag, notModified: false, pages: page };
    }
    return { downloads: seen ? total : 0, etag, notModified: false, pages: maxPages };
}
export async function fetchReleaseBatch(http, repoIds, options = {}) {
    const results = await mapLimit(repoIds, options.concurrency ?? 4, async (repoId) => {
        const result = await fetchReleaseDownloads(http, repoId, {
            ...(options.token ? { token: options.token } : {}),
            ...(options.maxPages ? { maxPages: options.maxPages } : {}),
        });
        return { repoId, downloads: result.downloads, error: null };
    });
    const out = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled')
            out.push(result.value);
        else
            out.push({ repoId: repoIds[index] ?? '?', downloads: null, error: String(result.reason) });
    });
    options.log?.(`releases ${out.filter((entry) => entry.error === null).length}/${repoIds.length} ok`);
    return out;
}
//# sourceMappingURL=releases.js.map