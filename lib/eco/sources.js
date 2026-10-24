/** Data collection from the two real "downloads" surfaces the ecosystem has:
 *  - GitHub search API for repos in the dsh-plugin topics (stars, dates)
 *  - GitHub releases' asset download_count summed per repo
 *  - npm last-week downloads for packages matching dsh-plugin keywords
 * All fetches tolerate failure per-source: a dead source degrades that metric
 * to undefined instead of failing the scan. */
async function getJson(url, options) {
    const headers = { 'User-Agent': 'dsh-plugin-eco-scan', Accept: 'application/vnd.github+json' };
    if (options.token)
        headers.Authorization = `Bearer ${options.token}`;
    const requestInit = { headers };
    if (options.signal !== undefined)
        requestInit.signal = options.signal;
    const response = await fetch(url, requestInit);
    if (!response.ok)
        throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
}
/** Search both known topics; dedupe by full_name. */
export async function fetchTopicRepos(options) {
    const topics = ['dsh-plugin', 'dsh-plugins'];
    const byName = new Map();
    for (const topic of topics) {
        try {
            const payload = (await getJson(`https://api.github.com/search/repositories?q=topic:${topic}&per_page=100&sort=stars`, options));
            for (const item of payload.items ?? [])
                byName.set(item.full_name, item);
        }
        catch {
            // a failed topic search just shrinks the corpus
        }
    }
    return [...byName.values()];
}
export async function fetchReleaseDownloads(fullName, options) {
    try {
        const releases = (await getJson(`https://api.github.com/repos/${fullName}/releases?per_page=20`, options));
        if (!Array.isArray(releases))
            return undefined;
        let total = 0;
        let seen = 0;
        for (const release of releases) {
            for (const asset of release.assets ?? []) {
                total += asset.download_count ?? 0;
                seen++;
            }
        }
        return seen ? total : undefined;
    }
    catch {
        return undefined;
    }
}
/** npm weekly downloads for every published package whose name or keywords tie
 * it to the dsh plugin ecosystem. */
export async function fetchNpmWeekly(keywords = ['dsh-plugin', 'deepseek-harness'], options = {}) {
    const downloads = new Map();
    for (const keyword of keywords) {
        try {
            const search = (await getJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(keyword)}&size=50`, options));
            for (const object of search.objects ?? []) {
                const name = object.package?.name;
                if (!name || downloads.has(name))
                    continue;
                try {
                    const point = (await getJson(`https://api.npmjs.org/downloads/point/last-week/${name}`, options));
                    if (typeof point.downloads === 'number')
                        downloads.set(name, point.downloads);
                }
                catch {
                    // per-package failure is normal (name reserved, rate limit)
                }
            }
        }
        catch {
            // search failure shrinks coverage
        }
    }
    return downloads;
}
export function readTokenFromEnv(envNames) {
    for (const name of envNames) {
        const value = process.env[name]?.trim();
        if (value)
            return value;
    }
    return undefined;
}
export async function fetchNpmRangeGrowth(names, options = {}) {
    const out = new Map();
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const until = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10);
    for (const name of names) {
        try {
            const payload = (await getJson(`https://api.npmjs.org/downloads/range/${since}:${until}/${name}`, options));
            const daily = (payload.downloads ?? []).map((point) => point.downloads);
            const { week, prev, growthPct } = weekGrowthFrom(daily);
            out.set(name, { week, prev, growthPct });
        }
        catch {
            // per-package failure is normal
        }
    }
    return out;
}
function weekGrowthFrom(daily) {
    if (daily.length < 8)
        return { week: daily.reduce((a, b) => a + b, 0), prev: 0, growthPct: null };
    const week = daily.slice(-7).reduce((a, b) => a + b, 0);
    const prev = daily.slice(-14, -7).reduce((a, b) => a + b, 0);
    return { week, prev, growthPct: prev > 0 ? (week - prev) / prev : null };
}
//# sourceMappingURL=sources.js.map