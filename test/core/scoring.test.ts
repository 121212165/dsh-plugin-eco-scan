import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ADOPTION_CAP,
  MIN_PREV_FOR_VELOCITY,
  WEIGHTS,
  adoptionScore,
  ageBucket,
  maintenanceScore,
  qualityScore,
  rankInSegment,
  scoreRepos,
  smoothedGrowth,
  velocityScore,
  type ScoreInput,
} from '../../src/core/scoring.ts';

const NOW = new Date('2026-10-29T00:00:00.000Z');

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    repoId: 'alice/plugin',
    segment: 'tools-devx',
    stars: 100,
    description: 'a plugin',
    weekly: 100,
    prev: 100,
    releaseDownloads: 0,
    createdAt: '2020-01-01T00:00:00.000Z',
    pushedAt: NOW.toISOString(),
    ci: true,
    testsCount: 10,
    issueCloseHours: 1,
    ...overrides,
  };
}

test('weights sum to one so a perfect repo scores exactly 100', () => {
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((total, weight) => total + weight, 0) - 1) < 1e-9);
  const [row] = scoreRepos([input({ weekly: 10_000, prev: 10, releaseDownloads: ADOPTION_CAP })], { now: NOW });
  assert.ok(row);
  assert.equal(row.velocity, 100);
  assert.equal(row.adoption, 100);
  assert.equal(row.quality, 100);
  assert.equal(row.maintenance, 100);
  assert.equal(row.score, 100);
});

test('velocity is prior-smoothed: growth from zero is finite, not infinite', () => {
  assert.equal(smoothedGrowth(10, 0), 0.5);
  assert.equal(smoothedGrowth(0, 20), -0.5);
  assert.equal(smoothedGrowth(null, 20), null);
  assert.equal(smoothedGrowth(20, null), null);
  assert.equal(velocityScore(0), 50);
  assert.ok(velocityScore(0.5) > 50 && velocityScore(0.5) < 100);
  assert.equal(velocityScore(1e9), 100);
  assert.equal(velocityScore(-1e9), 0);
});

test('adoption compresses with log1p and saturates at the cap', () => {
  assert.equal(adoptionScore(0, 0), 0);
  assert.equal(adoptionScore(ADOPTION_CAP, 0), 100);
  assert.ok(Math.abs(adoptionScore(10, 0) - (100 * Math.log(11)) / Math.log(ADOPTION_CAP + 1)) < 1e-9);
  const heavy = adoptionScore(1000, 1000);
  const light = adoptionScore(1000, 0);
  assert.ok(heavy > light, 'release downloads count toward reach');
});

test('quality rewards CI, tests and fast issue closure, and is neutral when unknown', () => {
  assert.equal(qualityScore(true, 10, 1), 100);
  assert.equal(qualityScore(false, 0, 1000), 0);
  const unknown = qualityScore(null, null, null);
  assert.ok(unknown > 0 && unknown < 50, `partial credit for unknown facts, got ${unknown}`);
  assert.ok(qualityScore(true, 5, 100) > qualityScore(false, 5, 100));
  assert.ok(qualityScore(true, 5, 24) > qualityScore(true, 5, 200));
  assert.ok(qualityScore(true, 5, 500) > qualityScore(true, 5, 1000));
});

test('maintenance decays exponentially with days since the last push', () => {
  assert.equal(maintenanceScore(NOW.toISOString(), NOW), 100);
  const ninety = maintenanceScore('2026-07-31T00:00:00.000Z', NOW);
  assert.ok(Math.abs(ninety - 100 * Math.exp(-1)) < 0.01, `90 days ≈ e^-1, got ${ninety}`);
  assert.ok(maintenanceScore('2025-10-29T00:00:00.000Z', NOW) < 3, 'a year idle is nearly dead');
  assert.equal(maintenanceScore('not-a-date', NOW), 40);
});

test('age buckets split at 30 and 90 days', () => {
  assert.equal(ageBucket('2026-10-20T00:00:00.000Z', NOW), 'new');
  assert.equal(ageBucket('2026-08-01T00:00:00.000Z', NOW), 'young');
  assert.equal(ageBucket('2023-01-01T00:00:00.000Z', NOW), 'established');
  assert.equal(ageBucket('', NOW), 'established');
});

test('repos with too little history are marked insufficient and halved instead of topping the list', () => {
  const rows = scoreRepos(
    [
      input({ repoId: 'a/tiny', weekly: 500, prev: 1 }),
      input({ repoId: 'b/solid', weekly: 120, prev: 100 }),
      input({ repoId: 'c/unknown', weekly: null, prev: null }),
    ],
    { now: NOW },
  );
  const tiny = rows.find((row) => row.repoId === 'a/tiny');
  const unknown = rows.find((row) => row.repoId === 'c/unknown');
  assert.equal(tiny?.insufficient, true);
  assert.equal(tiny?.rank, 2, 'still ranked, but halved behind the steady repo');
  assert.equal(unknown?.rank, 3);
  assert.ok(tiny!.score < tiny!.components.velocity * WEIGHTS.velocity + tiny!.components.adoption * WEIGHTS.adoption + tiny!.components.quality * WEIGHTS.quality + tiny!.components.maintenance * WEIGHTS.maintenance);
  assert.equal(unknown?.insufficient, true);
  assert.equal(MIN_PREV_FOR_VELOCITY, 5);
  assert.ok(rankInSegment(rows, null).every((row) => !row.insufficient));
});

test('rank is assigned inside (segment × age) cohorts, not globally', () => {
  const rows = scoreRepos(
    [
      input({ repoId: 'a/old', stars: 1000 }),
      input({ repoId: 'b/old', stars: 10 }),
      input({ repoId: 'c/new', createdAt: '2026-10-20T00:00:00.000Z' }),
      input({ repoId: 'd/other-segment', segment: 'ui-client' }),
    ],
    { now: NOW },
  );
  const byId = new Map(rows.map((row) => [row.repoId, row]));
  assert.equal(byId.get('a/old')?.cohort, 'tools-devx/established');
  assert.equal(byId.get('c/new')?.cohort, 'tools-devx/new');
  assert.equal(byId.get('c/new')?.rank, 1, 'new cohort has a single member and ranks first');
  assert.equal(byId.get('a/old')?.rank, 1);
  assert.equal(byId.get('b/old')?.rank, 2);
  assert.equal(byId.get('d/other-segment')?.rank, 1, 'a different segment restarts at 1');
});

test('MAD outliers are flagged and downweighted by half', () => {
  const base = Array.from({ length: 5 }, (_, index) => input({ repoId: `base/${index}`, weekly: 100 + index, prev: 100, releaseDownloads: 0, ci: false, testsCount: 0, issueCloseHours: 1000 }));
  const extreme = input({ repoId: 'x/outlier', weekly: 10_000, prev: 10, releaseDownloads: ADOPTION_CAP });
  const rows = scoreRepos([...base, extreme], { now: NOW });
  const outlier = rows.find((row) => row.repoId === 'x/outlier');
  assert.ok(outlier);
  assert.equal(outlier.outlier, true);
  const raw = WEIGHTS.velocity * outlier.components.velocity + WEIGHTS.adoption * outlier.components.adoption + WEIGHTS.quality * outlier.components.quality + WEIGHTS.maintenance * outlier.components.maintenance;
  assert.ok(Math.abs(outlier.score - raw / 2) < 0.02, `${outlier.score} should be half of ${raw}`);
});
