/** Robust scoring. v1's `growthPct * sqrt(size)` over-rewards tiny bases, so
 * v2 smooths velocity with a Beta-style prior (alpha=20), scores four
 * components 0–100, ranks inside (segment × age) cohorts, and downweights MAD
 * outliers. Repos whose previous week is too small are marked `insufficient`
 * and excluded from rankings instead of topping them. */
import type { TopRow } from './types.ts';
import { clamp, daysSince, madSigma, median, round } from './util.ts';

export const WEIGHTS = { velocity: 0.4, adoption: 0.3, quality: 0.2, maintenance: 0.1 } as const;
export const VELOCITY_PRIOR = 20;
export const MIN_PREV_FOR_VELOCITY = 5;
export const ADOPTION_CAP = 5000;

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

export function ageBucket(createdAt: string, now = new Date()): 'new' | 'young' | 'established' {
  const age = daysSince(createdAt, now);
  if (age === null) return 'established';
  if (age < 30) return 'new';
  if (age < 90) return 'young';
  return 'established';
}

/** Smoothed relative change. prev=0 still yields a finite, damped number:
 * 10 downloads from nothing is (10-0)/(0+20) = +0.5, not +∞. */
export function smoothedGrowth(weekly: number | null, prev: number | null, prior = VELOCITY_PRIOR): number | null {
  if (weekly === null || prev === null) return null;
  return (weekly - prev) / (prev + prior);
}

export function velocityScore(growthRate: number | null): number {
  if (growthRate === null) return 50;
  return clamp(50 + 50 * Math.tanh(growthRate), 0, 100);
}

export function adoptionScore(weekly: number | null, releaseDownloads: number | null): number {
  // npm weekly is a weekly rate, release counts are lifetime; both proxy reach.
  const units = (weekly ?? 0) + (releaseDownloads ?? 0);
  return clamp((100 * Math.log1p(units)) / Math.log1p(ADOPTION_CAP), 0, 100);
}

export function qualityScore(ci: boolean | null, testsCount: number | null, issueCloseHours: number | null): number {
  const ciPart = ci === null ? 15 : ci ? 40 : 0;
  const testPart = testsCount === null ? 10 : clamp((testsCount / 10) * 30, 0, 30);
  const issuePart = issueCloseHours === null ? 15 : issueCloseHours <= 48 ? 30 : issueCloseHours <= 168 ? 20 : issueCloseHours <= 720 ? 10 : 0;
  return clamp(ciPart + testPart + issuePart, 0, 100);
}

export function maintenanceScore(pushedAt: string, now = new Date()): number {
  const days = daysSince(pushedAt, now);
  if (days === null) return 40;
  return clamp(100 * Math.exp(-days / 90), 0, 100);
}

export function scoreRepos(inputs: readonly ScoreInput[], options: { now?: Date } = {}): ScoreResult[] {
  const now = options.now ?? new Date();
  const rows: ScoreResult[] = inputs.map((input) => {
    const growthRate = smoothedGrowth(input.weekly, input.prev);
    const velocity = velocityScore(growthRate);
    const adoption = adoptionScore(input.weekly, input.releaseDownloads);
    const quality = qualityScore(input.ci, input.testsCount, input.issueCloseHours);
    const maintenance = maintenanceScore(input.pushedAt, now);
    const composite = WEIGHTS.velocity * velocity + WEIGHTS.adoption * adoption + WEIGHTS.quality * quality + WEIGHTS.maintenance * maintenance;
    const insufficient = input.weekly === null || input.prev === null || input.prev < MIN_PREV_FOR_VELOCITY;
    const bucket = ageBucket(input.createdAt, now);
    return {
      repoId: input.repoId,
      segment: input.segment,
      stars: input.stars,
      description: input.description,
      npmWeekly: input.weekly,
      releaseDownloads: input.releaseDownloads,
      score: round(composite, 2),
      velocity: round(velocity, 2),
      adoption: round(adoption, 2),
      quality: round(quality, 2),
      maintenance: round(maintenance, 2),
      cohort: `${input.segment}/${bucket}`,
      rank: 0,
      insufficient,
      outlier: false,
      components: { velocity, adoption, quality, maintenance },
      growthRate,
      smoothedGrowth: growthRate,
    };
  });

  const cohorts = new Map<string, ScoreResult[]>();
  for (const row of rows) {
    const list = cohorts.get(row.cohort) ?? [];
    list.push(row);
    cohorts.set(row.cohort, list);
  }

  for (const members of cohorts.values()) {
    const scores = members.map((row) => row.score);
    const center = median(scores) ?? 0;
    const sigma = madSigma(scores);
    for (const row of members) {
      if (!row.insufficient && sigma > 0 && Math.abs(row.score - center) > 3 * sigma) {
        row.outlier = true;
        row.score = round(row.score * 0.5, 2);
      }
      if (row.insufficient) row.score = round(row.score * 0.5, 2);
    }
    const ranked = [...members].sort((a, b) => b.score - a.score);
    ranked.forEach((row, index) => {
      row.rank = index + 1;
    });
  }

  return rows.sort((a, b) => b.score - a.score || a.repoId.localeCompare(b.repoId));
}

export function rankInSegment(rows: readonly ScoreResult[], segment: string | null, limit = 10): ScoreResult[] {
  return rows
    .filter((row) => (segment ? row.segment === segment : true))
    .filter((row) => !row.insufficient)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
