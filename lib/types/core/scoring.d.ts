/** Robust scoring. v1's `growthPct * sqrt(size)` over-rewards tiny bases, so
 * v2 smooths velocity with a Beta-style prior (alpha=20), scores four
 * components 0–100, ranks inside (segment × age) cohorts, and downweights MAD
 * outliers. Repos whose previous week is too small are marked `insufficient`
 * and excluded from rankings instead of topping them. */
import type { TopRow } from './types.ts';
export declare const WEIGHTS: {
    readonly velocity: 0.4;
    readonly adoption: 0.3;
    readonly quality: 0.2;
    readonly maintenance: 0.1;
};
export declare const VELOCITY_PRIOR = 20;
export declare const MIN_PREV_FOR_VELOCITY = 5;
export declare const ADOPTION_CAP = 5000;
export interface ScoreInput {
    repoId: string;
    segment: string;
    stars: number;
    description: string;
    weekly: number | null;
    prev: number | null;
    releaseDownloads: number | null;
    createdAt: string;
    pushedAt: string;
    ci: boolean | null;
    testsCount: number | null;
    issueCloseHours: number | null;
}
export interface ScoreResult extends TopRow {
    components: {
        velocity: number;
        adoption: number;
        quality: number;
        maintenance: number;
    };
    growthRate: number | null;
    smoothedGrowth: number | null;
}
export declare function ageBucket(createdAt: string, now?: Date): 'new' | 'young' | 'established';
/** Smoothed relative change. prev=0 still yields a finite, damped number:
 * 10 downloads from nothing is (10-0)/(0+20) = +0.5, not +∞. */
export declare function smoothedGrowth(weekly: number | null, prev: number | null, prior?: number): number | null;
export declare function velocityScore(growthRate: number | null): number;
export declare function adoptionScore(weekly: number | null, releaseDownloads: number | null): number;
export declare function qualityScore(ci: boolean | null, testsCount: number | null, issueCloseHours: number | null): number;
export declare function maintenanceScore(pushedAt: string, now?: Date): number;
export declare function scoreRepos(inputs: readonly ScoreInput[], options?: {
    now?: Date;
}): ScoreResult[];
export declare function rankInSegment(rows: readonly ScoreResult[], segment: string | null, limit?: number): ScoreResult[];
//# sourceMappingURL=scoring.d.ts.map