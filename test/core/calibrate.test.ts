import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calibrate, renderCalibration, ranks, spearman } from '../../src/core/calibrate.ts';
import { putMapping, upsertNpmPackage, writeSnapshot } from '../../src/core/storage.ts';
import { seedRepo, tempDb } from './helpers.ts';

test('ranks average ties instead of breaking them by position', () => {
  assert.deepEqual(ranks([10, 20, 30]), [1, 2, 3]);
  assert.deepEqual(ranks([1, 1, 2]), [1.5, 1.5, 3]);
  assert.deepEqual(ranks([5, 5, 5]), [2, 2, 2]);
});

test('Spearman is +1 for monotone, −1 for reversed, and null for a flat side', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  assert.equal(spearman([1, 2, 3, 4], [7, 7, 7, 7]), null);
  assert.equal(spearman([1, 2], [3, 4]), null, 'fewer than three pairs is not a correlation');
});

function seedHistories(): ReturnType<typeof tempDb>['db'] {
  const { db } = tempDb();
  const repos = ['a/rising', 'b/flat', 'c/falling', 'd/double'];
  for (const repo of repos) seedRepo(db, repo);
  const weekly: Record<string, [number, number, number]> = {
    // d1, d2, d3 — velocity is measured on d2 (prev = d1); realized on d2 → d3
    'a/rising': [100, 200, 400],
    'b/flat': [100, 100, 90],
    'c/falling': [100, 50, 60],
    'd/double': [100, 300, 350],
  };
  const dates = ['2026-10-20', '2026-10-21', '2026-10-22'];
  for (const repo of repos) {
    dates.forEach((date, index) => {
      writeSnapshot(db, {
        repoId: repo,
        date,
        stars: 10,
        npmWeekly: weekly[repo]?.[index] ?? null,
        releaseDownloads: null,
        segment: 'tools-devx',
        segmentConfidence: 0.9,
      });
    });
  }
  return db;
}

test('calibrate correlates the T0 signal with the realized T0→T1 change', () => {
  const db = seedHistories();
  const report = calibrate(db, { from: '2026-10-21', to: '2026-10-22' });
  assert.equal(report.reason, null);
  assert.equal(report.pairs, 4);
  assert.ok(report.spearman !== null && report.spearman >= 0.59, `velocity should track realized growth (${report.spearman})`);
  assert.ok(report.baselineSpearman !== null);
  assert.equal(report.topOverlap?.k, 10);
  assert.equal(report.topOverlap?.velocity, 4, 'with fewer pairs than k every realized mover is in the top set');
  assert.equal(report.rows[0]?.repoId, 'd/double', 'velocity ranks the +200% repo first');
  assert.ok(report.rows[0]?.realized !== undefined);

  const text = renderCalibration(report);
  assert.ok(text.includes('样本外校准 2026-10-21 → 2026-10-22'), text);
  assert.ok(text.includes('Top10 命中'), text);
  assert.ok(text.includes('d/double'), text);
});

test('a flat realized side renders n/a instead of a fake zero correlation', () => {
  const { db } = tempDb();
  for (const repo of ['a/one', 'b/two', 'c/three']) {
    seedRepo(db, repo);
    for (const date of ['2026-10-19', '2026-10-20', '2026-10-21']) {
      writeSnapshot(db, { repoId: repo, date, stars: 1, npmWeekly: 100, releaseDownloads: null, segment: 'tools-devx', segmentConfidence: 0.9 });
    }
  }
  const report = calibrate(db, { from: '2026-10-20', to: '2026-10-21' });
  assert.equal(report.pairs, 3);
  assert.equal(report.spearman, null, 'every repo has the same velocity and the same realized change');
  assert.ok(renderCalibration(report).includes('velocity n/a'));
});

test('calibrate picks the previous date by default and reports when it cannot', () => {
  const db = seedHistories();
  const report = calibrate(db);
  assert.equal(report.to, '2026-10-22');
  assert.equal(report.from, '2026-10-21');

  const { db: single } = tempDb();
  seedRepo(single, 'only/one');
  writeSnapshot(single, { repoId: 'only/one', date: '2026-10-22', stars: 1, npmWeekly: 5, releaseDownloads: null, segment: 'other', segmentConfidence: 0 });
  const none = calibrate(single);
  assert.equal(none.pairs, 0);
  assert.ok(none.reason?.includes('两个不同日期'));
  assert.ok(renderCalibration(none).includes('需要至少'));
});

test('a null weekly in the baseline snapshot is not filled in from today’s package row', () => {
  const { db } = tempDb();
  seedRepo(db, 'a/one');
  putMapping(db, { repoId: 'a/one', npmName: 'one-pkg', confidence: 1, source: 'manual' });
  // npm_packages holds the value fetched today; the historical snapshot has no
  // observation, so using the package table here would fake a zero change.
  upsertNpmPackage(db, { name: 'one-pkg', weekly: 200, prev: 100, growthPct: 1, fetchedAt: '2026-10-21T00:00:00.000Z' });
  writeSnapshot(db, { repoId: 'a/one', date: '2026-10-19', stars: 1, npmWeekly: 100, releaseDownloads: null, segment: 'tools-devx', segmentConfidence: 0.9 });
  writeSnapshot(db, { repoId: 'a/one', date: '2026-10-20', stars: 1, npmWeekly: null, releaseDownloads: null, segment: 'tools-devx', segmentConfidence: 0.9 });
  writeSnapshot(db, { repoId: 'a/one', date: '2026-10-21', stars: 1, npmWeekly: 200, releaseDownloads: null, segment: 'tools-devx', segmentConfidence: 0.9 });
  const report = calibrate(db, { from: '2026-10-20', to: '2026-10-21' });
  assert.equal(report.pairs, 0, 'the 10-20 snapshot never observed downloads, so there is no baseline');
});

test('calibration ignores repos that are unmapped or lack a later observation', () => {
  const { db } = tempDb();
  seedRepo(db, 'a/one');
  seedRepo(db, 'b/two');
  for (const date of ['2026-10-19', '2026-10-20']) {
    writeSnapshot(db, { repoId: 'a/one', date, stars: 1, npmWeekly: 100, releaseDownloads: null, segment: 'tools-devx', segmentConfidence: 0.9 });
  }
  // b/two only exists on the later date, so it has no baseline to grow from
  writeSnapshot(db, { repoId: 'b/two', date: '2026-10-21', stars: 1, npmWeekly: 500, releaseDownloads: null, segment: 'tools-devx', segmentConfidence: 0.9 });
  writeSnapshot(db, { repoId: 'a/one', date: '2026-10-21', stars: 1, npmWeekly: 100, releaseDownloads: null, segment: 'tools-devx', segmentConfidence: 0.9 });
  const report = calibrate(db, { from: '2026-10-20', to: '2026-10-21' });
  assert.equal(report.pairs, 1);
  assert.ok(report.reason?.includes('不足 3 个'));
});
