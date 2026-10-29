/** Small pure helpers shared by every core module. Kept dependency-free so the
 * core stays importable from a bare Node script. */
import { homedir } from 'node:os';
import { join } from 'node:path';

export function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2));
  return path;
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isoNow(now = new Date()): string {
  return now.toISOString();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return Math.max(0, (now.getTime() - time) / 86_400_000);
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

/** Robust spread: 1.4826 * median absolute deviation (a σ estimate that does
 * not assume normality). Returns 0 when more than half the values are equal. */
export function madSigma(values: number[]): number {
  const center = median(values);
  if (center === null) return 0;
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = median(deviations);
  return mad === null ? 0 : 1.4826 * mad;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Bounded-concurrency map that keeps input order and never rejects early:
 * each failure is returned as a rejected result so callers decide the policy. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const width = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: width }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index] as T;
      try {
        results[index] = { status: 'fulfilled', value: await worker(item, index) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export function normalizeRepoId(fullName: string): string {
  const [owner = '', name = ''] = fullName.trim().split('/');
  return `${owner.toLowerCase()}/${name.toLowerCase()}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
