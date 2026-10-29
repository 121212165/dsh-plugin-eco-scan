import { clamp, daysSince, madSigma, median, round } from './util.js';
export const WEIGHTS = { velocity: 0.4, adoption: 0.3, quality: 0.2, maintenance: 0.1 };
export const VELOCITY_PRIOR = 20;
export const MIN_PREV_FOR_VELOCITY = 5;
export const ADOPTION_CAP = 5000;
export function ageBucket(createdAt, now = new Date()) {
    const age = daysSince(createdAt, now);
    if (age === null)
        return 'established';
    if (age < 30)
        return 'new';
    if (age < 90)
        return 'young';
    return 'established';
}
/** Smoothed relative change. prev=0 still yields a finite, damped number:
 * 10 downloads from nothing is (10-0)/(0+20) = +0.5, not +∞. */
export function smoothedGrowth(weekly, prev, prior = VELOCITY_PRIOR) {
    if (weekly === null || prev === null)
        return null;
    return (weekly - prev) / (prev + prior);
}
export function velocityScore(growthRate) {
    if (growthRate === null)
        return 50;
    return clamp(50 + 50 * Math.tanh(growthRate), 0, 100);
}
export function adoptionScore(weekly, releaseDownloads) {
    // npm weekly is a weekly rate, release counts are lifetime; both proxy reach.
    const units = (weekly ?? 0) + (releaseDownloads ?? 0);
    return clamp((100 * Math.log1p(units)) / Math.log1p(ADOPTION_CAP), 0, 100);
}
export function qualityScore(ci, testsCount, issueCloseHours) {
    const ciPart = ci === null ? 15 : ci ? 40 : 0;
    const testPart = testsCount === null ? 10 : clamp((testsCount / 10) * 30, 0, 30);
    const issuePart = issueCloseHours === null ? 15 : issueCloseHours <= 48 ? 30 : issueCloseHours <= 168 ? 20 : issueCloseHours <= 720 ? 10 : 0;
    return clamp(ciPart + testPart + issuePart, 0, 100);
}
export function maintenanceScore(pushedAt, now = new Date()) {
    const days = daysSince(pushedAt, now);
    if (days === null)
        return 40;
    return clamp(100 * Math.exp(-days / 90), 0, 100);
}
export function scoreRepos(inputs, options = {}) {
    const now = options.now ?? new Date();
    const rows = inputs.map((input) => {
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
    const cohorts = new Map();
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
            if (row.insufficient)
                row.score = round(row.score * 0.5, 2);
        }
        const ranked = [...members].sort((a, b) => b.score - a.score);
        ranked.forEach((row, index) => {
            row.rank = index + 1;
        });
    }
    return rows.sort((a, b) => b.score - a.score || a.repoId.localeCompare(b.repoId));
}
export function rankInSegment(rows, segment, limit = 10) {
    return rows
        .filter((row) => (segment ? row.segment === segment : true))
        .filter((row) => !row.insufficient)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
//# sourceMappingURL=scoring.js.map