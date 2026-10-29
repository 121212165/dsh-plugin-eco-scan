export declare function expandHome(path: string): string;
export declare function todayUtc(now?: Date): string;
export declare function isoNow(now?: Date): string;
export declare function daysBetween(from: string, to: string): number;
export declare function daysSince(iso: string | null, now?: Date): number | null;
export declare function clamp(value: number, low: number, high: number): number;
export declare function median(values: number[]): number | null;
/** Robust spread: 1.4826 * median absolute deviation (a σ estimate that does
 * not assume normality). Returns 0 when more than half the values are equal. */
export declare function madSigma(values: number[]): number;
export declare function round(value: number, digits?: number): number;
/** Bounded-concurrency map that keeps input order and never rejects early:
 * each failure is returned as a rejected result so callers decide the policy. */
export declare function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]>;
export declare function normalizeRepoId(fullName: string): string;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function asString(value: unknown): string | null;
export declare function asNumber(value: unknown): number | null;
export declare function asStringArray(value: unknown): string[];
//# sourceMappingURL=util.d.ts.map