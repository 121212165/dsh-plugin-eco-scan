/** Data collection from the two real "downloads" surfaces the ecosystem has:
 *  - GitHub search API for repos in the dsh-plugin topics (stars, dates)
 *  - GitHub releases' asset download_count summed per repo
 *  - npm last-week downloads for packages matching dsh-plugin keywords
 * All fetches tolerate failure per-source: a dead source degrades that metric
 * to undefined instead of failing the scan. */

export interface FetchOptions {
  token?: string;
  signal?: AbortSignal;
}

async function getJson(url: string, options: FetchOptions): Promise<unknown> {
  const headers: Record<string, string> = { 'User-Agent': 'dsh-plugin-eco-scan', Accept: 'application/vnd.github+json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(url, { headers, signal: options.signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

export interface RawRepo {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  created_at: string;
  pushed_at: string;
}

/** Search both known topics; dedupe by full_name. */
export async function fetchTopicRepos(options: FetchOptions): Promise<RawRepo[]> {
  const topics = ['dsh-plugin', 'dsh-plugins'];
  const byName = new Map<string, RawRepo>();
  for (const topic of topics) {
    try {
      const payload = (await getJson(`https://api.github.com/search/repositories?q=topic:${topic}&per_page=100&sort=stars`, options)) as {
        items?: RawRepo[];
      };
      for (const item of payload.items ?? []) byName.set(item.full_name, item);
    } catch {
      // a failed topic search just shrinks the corpus
    }
  }
  return [...byName.values()];
}

export async function fetchReleaseDownloads(fullName: string, options: FetchOptions): Promise<number | undefined> {
  try {
    const releases = (await getJson(`https://api.github.com/repos/${fullName}/releases?per_page=20`, options)) as {
      assets?: { download_count?: number }[];
    }[];
    if (!Array.isArray(releases)) return undefined;
    let total = 0;
    let seen = 0;
    for (const release of releases) {
      for (const asset of release.assets ?? []) {
        total += asset.download_count ?? 0;
        seen++;
      }
    }
    return seen ? total : undefined;
  } catch {
    return undefined;
  }
}

interface NpmSearchPackage {
  package: { name: string };
}

/** npm weekly downloads for every published package whose name or keywords tie
 * it to the dsh plugin ecosystem. */
export async function fetchNpmWeekly(keywords: string[] = ['dsh-plugin', 'deepseek-harness'], options: FetchOptions = {}): Promise<Map<string, number>> {
  const downloads = new Map<string, number>();
  for (const keyword of keywords) {
    try {
      const search = (await getJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(keyword)}&size=50`, options)) as {
        objects?: NpmSearchPackage[];
      };
      for (const object of search.objects ?? []) {
        const name = object.package?.name;
        if (!name || downloads.has(name)) continue;
        try {
          const point = (await getJson(`https://api.npmjs.org/downloads/point/last-week/${name}`, options)) as { downloads?: number };
          if (typeof point.downloads === 'number') downloads.set(name, point.downloads);
        } catch {
          // per-package failure is normal (name reserved, rate limit)
        }
      }
    } catch {
      // search failure shrinks coverage
    }
  }
  return downloads;
}

export function readTokenFromEnv(envNames: string[]): string | undefined {
  for (const name of envNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export async function fetchNpmRangeGrowth(names: string[], options: FetchOptions = {}): Promise<Map<string, { week: number; prev: number; growthPct: number | null }>> {
  const out = new Map<string, { week: number; prev: number; growthPct: number | null }>();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const until = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10);
  for (const name of names) {
    try {
      const payload = (await getJson(`https://api.npmjs.org/downloads/range/${since}:${until}/${name}`, options)) as {
        downloads?: { downloads: number }[];
      };
      const daily = (payload.downloads ?? []).map((point) => point.downloads);
      const { week, prev, growthPct } = weekGrowthFrom(daily);
      out.set(name, { week, prev, growthPct });
    } catch {
      // per-package failure is normal
    }
  }
  return out;
}

function weekGrowthFrom(daily: number[]): { week: number; prev: number; growthPct: number | null } {
  if (daily.length < 8) return { week: daily.reduce((a, b) => a + b, 0), prev: 0, growthPct: null };
  const week = daily.slice(-7).reduce((a, b) => a + b, 0);
  const prev = daily.slice(-14, -7).reduce((a, b) => a + b, 0);
  return { week, prev, growthPct: prev > 0 ? (week - prev) / prev : null };
}
