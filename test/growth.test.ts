import assert from 'node:assert/strict';
import { test } from 'node:test';
import { growthRow, rankGrowth, renderGrowth, renderSegmentsGrowth, type RepoSeries } from '../src/eco/growth.ts';

const series = (fullName: string, segment: string, points: RepoSeries['points']): RepoSeries => ({ fullName, segment, points });

test('growth compares the two nearest observed metrics', () => {
  const row = growthRow(series('a/b', 'cost-budget', [
    { date: '2026-09-28', stars: 10, npmWeekly: 100 },
    { date: '2026-09-29', stars: 11, npmWeekly: 160 },
  ]));
  assert.equal(row.metric, 'npmWeekly');
  assert.equal(row.previous, 100);
  assert.equal(row.delta, 60);
  assert.equal(row.growthPct, 0.6);
  assert.equal(row.spanDays, 1);
  assert.ok(row.score > 0);
});

test('a single snapshot has no growth judgment', () => {
  const row = growthRow(series('a/b', 'other', [{ date: '2026-09-29', stars: 5 }]));
  assert.equal(row.metric, 'stars');
  assert.equal(row.growthPct, null);
  assert.equal(row.score, 0);
});

test('previous = 0 yields null growth instead of Infinity', () => {
  const row = growthRow(series('a/b', 'other', [
    { date: '2026-09-28', stars: 1, npmWeekly: 0 },
    { date: '2026-09-29', stars: 2, npmWeekly: 10 },
  ]));
  assert.equal(row.growthPct, null);
});

test('ranking drops zero-delta rows and sorts by score (velocity × size)', () => {
  const rows = rankGrowth([
    series('a/big-flat', 'other', [
      { date: '2026-09-28', stars: 10_000, npmWeekly: 50_000 },
      { date: '2026-09-29', stars: 10_000, npmWeekly: 50_000 },
    ]),
    series('a/small-rocket', 'other', [
      { date: '2026-09-28', stars: 3, npmWeekly: 20 },
      { date: '2026-09-29', stars: 4, npmWeekly: 80 },
    ]),
    series('a/dipper', 'other', [
      { date: '2026-09-28', stars: 9, npmWeekly: 100 },
      { date: '2026-09-29', stars: 10, npmWeekly: 50 },
    ]),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.fullName, 'a/small-rocket');
});

test('rendering shows pct with sign and span days', () => {
  const text = renderGrowth(rankGrowth([series('a/b', 'cost-budget', [
    { date: '2026-09-28', stars: 1, npmWeekly: 100 },
    { date: '2026-09-29', stars: 2, npmWeekly: 150 },
  ])]));
  assert.ok(text.includes('+50%'));
  assert.ok(text.includes('1d'));
  assert.ok(renderGrowth([]).includes('还没有'));
});

test('segment growth medians rank the niches', () => {
  const text = renderSegmentsGrowth(rankGrowth([
    series('a/x', 'cost-budget', [{ date: '2026-09-28', stars: 1, npmWeekly: 100 }, { date: '2026-09-29', stars: 1, npmWeekly: 200 }]),
    series('a/y', 'ui-client', [{ date: '2026-09-28', stars: 1, npmWeekly: 100 }, { date: '2026-09-29', stars: 1, npmWeekly: 110 }]),
    series('a/z', 'cost-budget', [{ date: '2026-09-28', stars: 1, npmWeekly: 50 }, { date: '2026-09-29', stars: 1, npmWeekly: 90 }]),
  ]));
  assert.ok(text.includes('cost-budget'));
  const costLine = text.split('\n').find((line) => line.includes('cost-budget'))!;
  assert.ok(costLine.includes('中位增长 90.0%')); // (100% + 80%) / 2
});
