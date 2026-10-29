import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lastSnapshotDates, repoSeries, segmentHeatmap } from '../../src/core/history.ts';
import { writeSnapshot, writeSnapshotSegments } from '../../src/core/storage.ts';
import { seedRepo, tempDb } from './helpers.ts';

function snapshot(db: ReturnType<typeof tempDb>['db'], repoId: string, date: string, weekly: number | null, segment = 'tools-devx'): void {
  writeSnapshot(db, { repoId, date, stars: 10, npmWeekly: weekly, releaseDownloads: null, segment, segmentConfidence: 0.9 });
}

test('lastSnapshotDates keeps the newest N dates in chronological order', () => {
  const { db } = tempDb();
  seedRepo(db, 'a/one');
  for (const date of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) snapshot(db, 'a/one', date, 10);
  assert.deepEqual(lastSnapshotDates(db, 2), ['2026-10-03', '2026-10-04']);
  assert.deepEqual(lastSnapshotDates(db, 99), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(lastSnapshotDates(db, 0).length, 1, 'a zero window is clamped to one date');
});

test('repoSeries returns only observed points, ordered by date', () => {
  const { db } = tempDb();
  seedRepo(db, 'a/one');
  seedRepo(db, 'b/two');
  snapshot(db, 'a/one', '2026-10-01', 10);
  snapshot(db, 'a/one', '2026-10-03', null);
  snapshot(db, 'b/two', '2026-10-02', 5);
  const series = repoSeries(db, ['a/one', 'b/two', 'c/missing'], ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.deepEqual(series.get('a/one'), [
    { date: '2026-10-01', stars: 10, weekly: 10 },
    { date: '2026-10-03', stars: 10, weekly: null },
  ]);
  assert.equal(series.get('b/two')?.length, 1);
  assert.equal(series.has('c/missing'), false);
  assert.equal(repoSeries(db, [], ['2026-10-01']).size, 0);
});

test('segmentHeatmap counts a multi-label repo once per label and leaves gaps null', () => {
  const { db } = tempDb();
  seedRepo(db, 'a/multi');
  seedRepo(db, 'b/plain');
  snapshot(db, 'a/multi', '2026-10-01', 100, 'tools-devx');
  snapshot(db, 'a/multi', '2026-10-02', 120, 'tools-devx');
  snapshot(db, 'b/plain', '2026-10-02', 30, 'memory-context');
  writeSnapshotSegments(db, 'a/multi', '2026-10-01', [
    { segment: 'tools-devx', confidence: 0.9, source: 'rules' },
    { segment: 'archive-export', confidence: 0.4, source: 'rules' },
  ]);
  writeSnapshotSegments(db, 'a/multi', '2026-10-02', [
    { segment: 'tools-devx', confidence: 0.9, source: 'rules' },
    { segment: 'archive-export', confidence: 0.4, source: 'rules' },
  ]);
  const heatmap = segmentHeatmap(db, { dates: 2 });
  assert.deepEqual(heatmap.dates, ['2026-10-01', '2026-10-02']);
  assert.deepEqual(heatmap.values.get('tools-devx'), [100, 120]);
  assert.deepEqual(heatmap.values.get('archive-export'), [100, 120], 'the second label carries the same downloads');
  assert.deepEqual(heatmap.values.get('memory-context'), [null, 30], 'no observation on the first day is a gap, not 0');
  assert.equal(heatmap.totals.get('tools-devx'), 120);
  assert.deepEqual(heatmap.segments, ['archive-export', 'tools-devx', 'memory-context'], 'ties break alphabetically');
});

test('segmentHeatmap falls back to the snapshot segment when no label rows exist', () => {
  const { db } = tempDb();
  seedRepo(db, 'a/legacy');
  snapshot(db, 'a/legacy', '2026-10-01', 42, 'legacy-segment');
  const heatmap = segmentHeatmap(db);
  assert.deepEqual(heatmap.segments, ['legacy-segment']);
  assert.deepEqual(heatmap.values.get('legacy-segment'), [42]);
});

test('an empty database yields an empty heatmap', () => {
  const { db } = tempDb();
  const heatmap = segmentHeatmap(db);
  assert.deepEqual(heatmap.dates, []);
  assert.deepEqual(heatmap.segments, []);
  assert.equal(heatmap.values.size, 0);
});
