import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UnsafeQueryError,
  assertReadOnlySql,
  coverage,
  diffRows,
  overview,
  queryReadOnly,
  scoreSummary,
  scoredSet,
  topRows,
  unmatchedRepos,
} from '../../src/core/queries.ts';
import { putMapping, replaceSegments, upsertNpmPackage, writeSnapshot, writeSnapshotSegments } from '../../src/core/storage.ts';
import { seedRepo, tempDb } from './helpers.ts';

function snap(repoId: string, date: string, fields: Partial<{ stars: number; npmWeekly: number | null; releaseDownloads: number | null; segment: string }> = {}) {
  return {
    repoId,
    date,
    stars: fields.stars ?? 10,
    npmWeekly: fields.npmWeekly === undefined ? null : fields.npmWeekly,
    releaseDownloads: fields.releaseDownloads === undefined ? null : fields.releaseDownloads,
    segment: fields.segment ?? 'tools-devx',
    segmentConfidence: 0.9,
  };
}

function seedTwoDays() {
  const { db } = tempDb();
  seedRepo(db, 'alice/alpha', { stars: 120, ci: true });
  seedRepo(db, 'bob/beta', { stars: 30, ci: false });
  writeSnapshot(db, snap('alice/alpha', '2026-10-28', { stars: 100, npmWeekly: 100, releaseDownloads: 10, segment: 'cost-budget' }));
  writeSnapshot(db, snap('bob/beta', '2026-10-28', { stars: 30, npmWeekly: 50, releaseDownloads: 0 }));
  writeSnapshot(db, snap('alice/alpha', '2026-10-29', { stars: 120, npmWeekly: 200, releaseDownloads: 30, segment: 'cost-budget' }));
  writeSnapshot(db, snap('bob/beta', '2026-10-29', { stars: 30, npmWeekly: 50, releaseDownloads: 0 }));
  return db;
}

test('scoredSet pairs the latest day with its predecessor and scores growth', () => {
  const db = seedTwoDays();
  const set = scoredSet(db);
  assert.equal(set.date, '2026-10-29');
  assert.equal(set.previousDate, '2026-10-28');
  assert.equal(set.scores.length, 2);
  const alpha = set.scores.find((row) => row.repoId === 'alice/alpha');
  assert.ok(alpha);
  assert.equal(alpha.npmWeekly, 200);
  assert.equal(alpha.segment, 'cost-budget');
  assert.ok(alpha.growthRate !== null && alpha.growthRate > 0.8);
  assert.ok(alpha.score > 0 && alpha.score <= 100);
  assert.equal(scoreSummary(set.scores).insufficient, 0);
});

test('when no earlier snapshot exists, npm_packages prev supplies the baseline', () => {
  const { db } = tempDb();
  seedRepo(db, 'alice/solo');
  upsertNpmPackage(db, { name: 'solo-pkg', weekly: 70, prev: 60, growthPct: 1 / 6, fetchedAt: '2026-10-29T00:00:00.000Z' });
  putMapping(db, { repoId: 'alice/solo', npmName: 'solo-pkg', confidence: 1, source: 'manual' });
  writeSnapshot(db, { ...snap('alice/solo', '2026-10-29'), npmWeekly: null });

  const set = scoredSet(db);
  assert.equal(set.previousDate, null);
  const row = set.scores[0];
  assert.equal(row?.npmWeekly, 70);
  assert.ok((row?.growthRate ?? 0) > 0, 'growth comes from the package range data');
  assert.equal(row?.insufficient, false);
});

test('topRows filters by segment and limit, and can include insufficient rows', () => {
  const db = seedTwoDays();
  const cost = topRows(db, { segment: 'cost-budget' });
  assert.equal(cost.date, '2026-10-29');
  assert.deepEqual(cost.rows.map((row) => row.repoId), ['alice/alpha']);
  assert.equal(topRows(db, { limit: 1 }).rows.length, 1);
  assert.equal(topRows(db, { segment: 'nope' }).rows.length, 0);

  seedRepo(db, 'carol/tiny');
  writeSnapshot(db, snap('carol/tiny', '2026-10-29', { npmWeekly: 5 }));
  writeSnapshot(db, snap('carol/tiny', '2026-10-28', { npmWeekly: 1 }));
  const visible = topRows(db, { limit: 10 }).rows;
  assert.ok(!visible.some((row) => row.repoId === 'carol/tiny'), 'prev < 5 is hidden by default');
  const all = topRows(db, { limit: 10, includeInsufficient: true }).rows;
  assert.ok(all.some((row) => row.repoId === 'carol/tiny'));
});

test('diffRows computes stars/npm/release deltas and sorts by movement', () => {
  const db = seedTwoDays();
  const diff = diffRows(db);
  assert.equal(diff.from, '2026-10-28');
  assert.equal(diff.to, '2026-10-29');
  const alpha = diff.rows.find((row) => row.repoId === 'alice/alpha');
  assert.deepEqual(alpha?.to, { date: '2026-10-29', stars: 120, npmWeekly: 200, releaseDownloads: 30 });
  assert.equal(alpha?.npmDelta, 100);
  assert.equal(alpha?.starsDelta, 20);
  assert.equal(alpha?.releaseDelta, 20);
  assert.equal(diff.rows[0]?.repoId, 'alice/alpha');
  const beta = diff.rows.find((row) => row.repoId === 'bob/beta');
  assert.equal(beta?.npmDelta, 0);

  const noBaseline = diffRows(db, '2026-10-28', '2026-10-28');
  assert.equal(noBaseline.from, '2026-10-28', 'explicit from wins');
  assert.ok(noBaseline.rows.every((row) => row.starsDelta === 0 && row.from !== null));
});

test('overview counts multi-label repos in every segment they belong to', () => {
  const db = seedTwoDays();
  replaceSegments(db, 'alice/alpha', [
    { segment: 'cost-budget', confidence: 0.9, source: 'rules' },
    { segment: 'tools-devx', confidence: 0.5, source: 'rules' },
  ]);
  writeSnapshotSegments(db, 'alice/alpha', '2026-10-29', [
    { segment: 'cost-budget', confidence: 0.9, source: 'rules' },
    { segment: 'tools-devx', confidence: 0.5, source: 'rules' },
  ]);
  const result = overview(db);
  assert.equal(result.totalRepos, 2);
  const cost = result.rows.find((row) => row.segment === 'cost-budget');
  const tools = result.rows.find((row) => row.segment === 'tools-devx');
  assert.equal(cost?.repos, 1);
  assert.equal(tools?.repos, 2, 'alpha appears under both labels, beta under its snapshot label');
  assert.equal(cost?.weeklyDownloads, 200);
  assert.equal(cost?.multiLabel, 2);
});

test('unmatchedRepos lists live repos with no mapping, most stars first', () => {
  const { db } = tempDb();
  seedRepo(db, 'a/small', { stars: 5 });
  seedRepo(db, 'a/big', { stars: 500 });
  seedRepo(db, 'a/archived', { stars: 900, archived: true });
  seedRepo(db, 'a/mapped', { stars: 50 });
  putMapping(db, { repoId: 'a/mapped', npmName: 'mapped', confidence: 1, source: 'manual' });
  assert.deepEqual(unmatchedRepos(db).map((repo) => repo.id), ['a/big', 'a/small']);
});

test('read-only guard strips comments and rejects writes, multiple statements and unknown tables', () => {
  assert.equal(assertReadOnlySql('SELECT * FROM repos;'), 'SELECT * FROM repos');
  assert.equal(assertReadOnlySql('/* hi */ SELECT id FROM repos -- trailing'), 'SELECT id FROM repos');
  assert.equal(
    assertReadOnlySql('WITH recent AS (SELECT * FROM snapshots) SELECT * FROM recent'),
    'WITH recent AS (SELECT * FROM snapshots) SELECT * FROM recent',
  );
  assert.equal(assertReadOnlySql('EXPLAIN SELECT * FROM repos'), 'EXPLAIN SELECT * FROM repos');
  assert.equal(assertReadOnlySql('select count(*) from repos r join npm_packages p on 1=1'), 'select count(*) from repos r join npm_packages p on 1=1');

  for (const sql of [
    '',
    '   ',
    'DELETE FROM repos',
    'SELECT * FROM repos; DROP TABLE repos',
    'PRAGMA table_info(repos)',
    'SELECT * FROM secret_table',
    'INSERT INTO repos VALUES (1)',
    'UPDATE repos SET stars = 0',
  ]) {
    assert.throws(() => assertReadOnlySql(sql), UnsafeQueryError, sql);
  }
});

test('queryReadOnly wraps the query, caps rows and reports truncation', () => {
  const { db } = tempDb();
  for (const id of ['a/one', 'a/two', 'a/three']) seedRepo(db, id);
  const result = queryReadOnly(db, 'SELECT id FROM repos ORDER BY id', 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.columns, ['id']);
  assert.deepEqual(result.rows.map((row) => row.id), ['a/one', 'a/three']);
  const all = queryReadOnly(db, 'SELECT COUNT(*) AS n FROM repos', 10);
  assert.equal(all.rows[0]?.n, 3);
  assert.equal(all.truncated, false);
  assert.throws(() => queryReadOnly(db, 'DELETE FROM repos'), UnsafeQueryError);
});

test('coverage reports mapped repos and snapshot completeness', () => {
  const db = seedTwoDays();
  putMapping(db, { repoId: 'alice/alpha', npmName: 'alpha', confidence: 1, source: 'manual' });
  const stats = coverage(db);
  assert.equal(stats.repos, 2);
  assert.equal(stats.mapped, 1);
  assert.equal(stats.withWeekly, 2, 'both repos carry a weekly figure');
});

test('scoreSummary reports median, outliers and insufficient counts', () => {
  const rows = [
    { score: 10, outlier: false, insufficient: false },
    { score: 20, outlier: true, insufficient: false },
    { score: 30, outlier: false, insufficient: true },
  ] as never[];
  assert.deepEqual(scoreSummary(rows), { median: 20, outliers: 1, insufficient: 1 });
  assert.deepEqual(scoreSummary([]), { median: 0, outliers: 0, insufficient: 0 });
});
