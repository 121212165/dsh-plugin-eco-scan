/** npm collector: package discovery through the registry search index (which
 * also exposes each package's repository URL — a zero-guess mapping) and
 * 14-day download ranges that yield both this week and last week, so growth
 * needs no second call. */
import type { HttpClient } from '../http.ts';
import type { NpmStat } from '../types.ts';
import { asNumber, asString, isRecord, mapLimit } from '../util.ts';

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

const DEFAULT_KEYWORDS = ['keywords:dsh-plugin', 'keywords:deepseek-harness', 'dsh-plugin'];

export interface NpmSearchResult {
  packages: NpmPackageInfo[];
  errors: string[];
}

export async function searchPackages(http: HttpClient, options: NpmSearchOptions = {}): Promise<NpmSearchResult> {
  const keywords = options.keywords ?? DEFAULT_KEYWORDS;
  const pageSize = Math.min(250, Math.max(1, options.pageSize ?? 250));
  const maxPages = Math.max(1, options.maxPages ?? 4);
  const maxPackages = Math.max(1, options.maxPackages ?? 1000);
  const byName = new Map<string, NpmPackageInfo>();
  const errors: string[] = [];
  for (const text of keywords) {
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=${pageSize}&from=${from}`;
      try {
        const { data } = await http.json<{ objects?: unknown[] }>(url);
        const objects = data?.objects ?? [];
        for (const object of objects) {
          const info = parseSearchObject(object);
          if (info) byName.set(info.name, info);
        }
        options.log?.(`npm.search ${text} page=${page + 1} total=${byName.size}`);
        if (objects.length < pageSize) break;
      } catch (error) {
        const message = `${text} page ${page + 1}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(message);
        options.log?.(`npm.search ${message}`);
        break;
      }
      if (byName.size >= maxPackages) break;
    }
  }
  return { packages: [...byName.values()].slice(0, maxPackages), errors };
}

function parseSearchObject(value: unknown): NpmPackageInfo | null {
  if (!isRecord(value) || !isRecord(value.package)) return null;
  const pkg = value.package;
  const name = asString(pkg.name);
  if (!name) return null;
  const links = isRecord(pkg.links) ? pkg.links : null;
  const npm = isRecord(pkg.npm) ? pkg.npm : null;
  const repositoryUrl = asString(links?.repository) ?? asString(npm?.repository);
  const keywords = Array.isArray(pkg.keywords) ? pkg.keywords.filter((item): item is string => typeof item === 'string') : [];
  const downloads = isRecord(pkg.downloads) ? pkg.downloads : null;
  return {
    name,
    repository: repositoryUrl,
    keywords,
    version: asString(pkg.version),
    weekly: asNumber(downloads?.weekly),
  };
}

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
  week: { start: string; end: string };
  prev: { start: string; end: string };
}

/** Two disjoint 7-day windows ending yesterday. `week` is the newest week and
 * `prev` the one before it, matching what `weekGrowthFrom` derives from a
 * 14-day range. */
export function downloadWindows(now = new Date()): DownloadWindows {
  const end = new Date(now.getTime() - 86_400_000);
  const day = (offset: number): string => new Date(end.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
  return {
    week: { start: day(6), end: day(0) },
    prev: { start: day(13), end: day(7) },
  };
}

export function rangeWindow(now = new Date()): { since: string; until: string } {
  const { prev, week } = downloadWindows(now);
  return { since: prev.start, until: week.end };
}

export function weekGrowthFrom(daily: number[]): { week: number; prev: number; growthPct: number | null } {
  const week = daily.slice(-7).reduce((total, value) => total + value, 0);
  if (daily.length < 14) return { week, prev: 0, growthPct: null };
  const prev = daily.slice(-14, -7).reduce((total, value) => total + value, 0);
  return { week, prev, growthPct: prev > 0 ? (week - prev) / prev : null };
}

export interface DownloadResult {
  stats: Map<string, NpmStat>;
  errors: string[];
}

/** npm limits bulk lookups: every name must be unscoped and the URL must stay
 * short, so chunks are capped by count and by joined length. */
const BULK_MAX_NAMES = 100;
const BULK_MAX_CHARS = 4000;

function chunkNames(names: readonly string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const name of names) {
    if (current.length >= BULK_MAX_NAMES || (current.length > 0 && length + name.length + 1 > BULK_MAX_CHARS)) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(name);
    length += name.length + 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function pointDownloads(data: unknown, names: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!isRecord(data)) return out;
  if (typeof data.downloads === 'number') {
    const name = asString(data.package) ?? names[0];
    if (name) out.set(name, data.downloads);
    return out;
  }
  for (const name of names) {
    const entry = data[name];
    const value = isRecord(entry) ? asNumber(entry.downloads) : null;
    if (value !== null) out.set(name, value);
  }
  return out;
}

interface ScopedStat {
  stat: NpmStat;
  measured: boolean;
}

/** One 14-day range per scoped package. When that fails and the search index
 * already gave a weekly count, keep it instead of spending another request. */
async function fetchRangeStat(
  http: HttpClient,
  name: string,
  since: string,
  until: string,
  fetchedAt: string,
  knownWeekly: number | null,
): Promise<ScopedStat> {
  try {
    const { data } = await http.json<{ downloads?: unknown[] }>(`https://api.npmjs.org/downloads/range/${since}:${until}/${name}`);
    const daily = (data?.downloads ?? [])
      .map((point) => (isRecord(point) ? asNumber(point.downloads) : null))
      .filter((value): value is number => value !== null);
    if (!daily.length) throw new Error('empty range');
    const { week, prev, growthPct } = weekGrowthFrom(daily);
    return { stat: { name, weekly: week, prev, growthPct, fetchedAt }, measured: true };
  } catch {
    if (knownWeekly !== null) {
      return { stat: { name, weekly: knownWeekly, prev: 0, growthPct: null, fetchedAt }, measured: false };
    }
    const { data } = await http.json<{ downloads?: unknown }>(`https://api.npmjs.org/downloads/point/last-week/${name}`);
    const weekly = isRecord(data) ? asNumber(data.downloads) : null;
    if (weekly === null) throw new Error(`no downloads for ${name}`);
    return { stat: { name, weekly, prev: 0, growthPct: null, fetchedAt }, measured: false };
  }
}

/** Fetch weekly and previous-week download totals without one request per
 * package: unscoped names ride the bulk point endpoint (two calls per chunk),
 * and scoped names — which npm refuses in bulk lookups — reuse the search
 * index's weekly count, spending the range budget on the biggest packages
 * first. Missing `prev` means growth is honestly unknown (insufficient), not
 * zero. Per-chunk and per-package failures are returned so the caller can
 * report a degraded run instead of silently storing nothing. */
export async function fetchDownloadStats(
  http: HttpClient,
  names: readonly string[],
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const now = options.now ?? new Date();
  const fetchedAt = now.toISOString();
  const { week: weekWindow, prev: prevWindow } = downloadWindows(now);
  const { since, until } = rangeWindow(now);
  const known = options.knownWeekly ?? new Map<string, number>();
  const out = new Map<string, NpmStat>();
  const errors: string[] = [];
  const unique = [...new Set(names)];
  const scoped = unique
    .filter((name) => name.startsWith('@'))
    .sort((left, right) => (known.get(right) ?? -1) - (known.get(left) ?? -1));
  const unscoped = unique.filter((name) => !name.startsWith('@'));

  const chunks = chunkNames(unscoped);
  const bulk = await mapLimit(chunks, options.bulkConcurrency ?? 2, async (chunk) => {
    const list = chunk.join(',');
    const week = pointDownloads(
      (await http.json<unknown>(`https://api.npmjs.org/downloads/point/${weekWindow.start}:${weekWindow.end}/${list}`)).data,
      chunk,
    );
    try {
      const prev = pointDownloads(
        (await http.json<unknown>(`https://api.npmjs.org/downloads/point/${prevWindow.start}:${prevWindow.end}/${list}`)).data,
        chunk,
      );
      return { week, prev, prevError: null };
    } catch (error) {
      return { week, prev: new Map<string, number>(), prevError: errorText(error) };
    }
  });
  for (const [index, result] of bulk.entries()) {
    const chunk = chunks[index]!;
    if (result.status === 'rejected') {
      errors.push(`point ${chunk[0]} (+${chunk.length - 1}): ${errorText(result.reason)}`);
      continue;
    }
    if (result.value.prevError !== null) {
      errors.push(`point prev ${chunk[0]} (+${chunk.length - 1}): ${result.value.prevError}`);
    }
    for (const name of chunk) {
      const weekly = result.value.week.get(name);
      const fallback = known.get(name);
      if (weekly === undefined) {
        if (fallback !== undefined) out.set(name, { name, weekly: fallback, prev: 0, growthPct: null, fetchedAt });
        continue;
      }
      const prev = result.value.prev.get(name) ?? 0;
      out.set(name, { name, weekly, prev, growthPct: prev > 0 ? (weekly - prev) / prev : null, fetchedAt });
    }
  }

  const budget = Math.max(0, options.scopedBudget ?? 200);
  const targets = scoped.slice(0, budget);
  const searchOnly = scoped.slice(budget);
  for (const name of searchOnly) {
    const weekly = known.get(name);
    if (weekly !== undefined) out.set(name, { name, weekly, prev: 0, growthPct: null, fetchedAt });
  }
  const scopedResults = await mapLimit(targets, options.concurrency ?? 3, (name) =>
    fetchRangeStat(http, name, since, until, fetchedAt, known.get(name) ?? null),
  );
  let measured = 0;
  for (const result of scopedResults) {
    if (result.status === 'fulfilled') {
      out.set(result.value.stat.name, result.value.stat);
      if (result.value.measured) measured++;
    } else {
      errors.push(errorText(result.reason));
    }
  }

  options.log?.(
    `npm.downloads ${out.size}/${unique.length} ok (${chunks.length} bulk, ${targets.length}/${scoped.length} scoped ranges measured ${measured}, ${searchOnly.length} search-only)`,
  );
  return { stats: out, errors };
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
