/** Out-of-sample calibration. With at least two snapshots we can ask the only
 * question that matters: did the ranking at T0 predict what actually grew by
 * T1? Spearman over ranks, not Pearson over levels, because both signals are
 * monotone at best. The baseline is the naive "biggest package wins" rule, so
 * a report can show whether the scoring adds anything over sorting by volume. */
import type { EcoDb } from './db.ts';
export interface CalibrationPair {
    repoId: string;
    velocity: number;
    score: number;
    baseline: number;
    realized: number;
    fromWeekly: number;
    toWeekly: number;
}
export interface CalibrationReport {
    from: string | null;
    to: string | null;
    pairs: number;
    spearman: number | null;
    scoreSpearman: number | null;
    baselineSpearman: number | null;
    topOverlap: {
        k: number;
        velocity: number;
        score: number;
        baseline: number;
    } | null;
    reason: string | null;
    rows: CalibrationPair[];
}
export declare function ranks(values: readonly number[]): number[];
/** Pearson correlation of ranks; null when there is too little data or one side
 * is constant (undefined correlation, not zero). */
export declare function spearman(xs: readonly number[], ys: readonly number[]): number | null;
export declare function calibrate(db: EcoDb, options?: {
    from?: string;
    to?: string;
    k?: number;
}): CalibrationReport;
export declare function renderCalibration(report: CalibrationReport): string;
//# sourceMappingURL=calibrate.d.ts.map