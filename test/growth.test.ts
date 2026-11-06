import assert from 'node:assert/strict';
import { test } from 'node:test';
import { growthRow, rankGrowth, rankLiveGrowth, renderGrowth, renderLiveGrowth, renderSegmentsGrowth, weekGrowth, type RepoSeries } from '../src/eco/growth.ts';

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

test('metric switch: previous is picked for the metric actually used, not a cross-metric value', () => {
  const row = growthRow(series('a/b', 'other', [
    { date: '2026-09-28', stars: 10, npmWeekly: 100 },
    { date: '2026-09-29', stars: 20 },
  ]));
  assert.equal(row.metric, 'stars');
  assert.equal(row.latest, 20);
  assert.equal(row.previous, 10);
  assert.equal(row.growthPct, 1);
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

for (let length = 8; length <= 13; length++) {
  test(`weekGrowth with ${length} samples never compares a truncated previous week`, () => {
    const daily = Array.from({ length }, (_, i) => i + 1);
    const before = [...daily];
    assert.deepEqual(weekGrowth(daily), { week: 7 * (length - 3), prev: 0, growthPct: null });
    assert.deepEqual(daily, before);
  });
}

test('weekGrowth computes a correct 14-day ratio', () => {
  const daily = Array.from({ length: 14 }, (_, i) => i + 1); // last7 = 77 (8..14), prev = 28 (1..7)
  const r = weekGrowth(daily);
  assert.equal(r.week, 77);
  assert.equal(r.prev, 28);
  assert.equal(r.growthPct, (77 - 28) / 28);
});

test('weekGrowth handles empty, short, zero-baseline and longer-than-14-day windows', () => {
  assert.deepEqual(weekGrowth([]), { week: 0, prev: 0, growthPct: null });
  assert.deepEqual(weekGrowth([4]), { week: 4, prev: 0, growthPct: null });
  assert.deepEqual(weekGrowth(Array(7).fill(3)), { week: 21, prev: 0, growthPct: null });
  assert.deepEqual(weekGrowth([...Array(7).fill(0), ...Array(7).fill(2)]), { week: 14, prev: 0, growthPct: null });
  assert.deepEqual(weekGrowth([9999, ...Array(7).fill(4), ...Array(7).fill(2)]), { week: 14, prev: 28, growthPct: -0.5 });
  assert.deepEqual(weekGrowth([...Array(7).fill(4), ...Array(7).fill(0)]), { week: 0, prev: 28, growthPct: -1 });
});

for (const metric of ['npmWeekly', 'releaseDownloads'] as const) {
  test(`${metric} skips missing intermediate observations, sorts without mutating input`, () => {
    const points = [
      { date: '2026-10-03', stars: 30, [metric]: 200 },
      { date: '2026-10-01', stars: 10, npmWeekly: 900, releaseDownloads: 800, [metric]: 100 },
      { date: '2026-10-02', stars: 20, [metric === 'npmWeekly' ? 'releaseDownloads' : 'npmWeekly']: 999 },
    ];
    const before = structuredClone(points);
    const row = growthRow(series('a/gap', 'other', points));
    assert.equal(row.metric, metric);
    assert.equal(row.previous, 100);
    assert.equal(row.latest, 200);
    assert.equal(row.delta, 100);
    assert.equal(row.spanDays, 2);
    assert.equal(row.growthPct, 1);
    assert.equal(row.score, Math.sqrt(200));
    assert.deepEqual(points, before);
  });

  test(`new ${metric} history has no cross-metric baseline`, () => {
    const row = growthRow(series('a/new-metric', 'other', [
      { date: '2026-10-01', stars: 100, [metric === 'npmWeekly' ? 'releaseDownloads' : 'npmWeekly']: 800 },
      { date: '2026-10-02', stars: 110, [metric]: 200 },
    ]));
    assert.equal(row.metric, metric);
    assert.equal(row.latest, 200);
    assert.equal(row.previous, null);
    assert.equal(row.delta, null);
    assert.equal(row.growthPct, null);
    assert.equal(row.spanDays, null);
    assert.equal(row.score, 0);
  });
}

test('zero npm remains the preferred metric, with negative growth and non-negative score', () => {
  const row = growthRow(series('a/zero', 'other', [
    { date: '2026-10-01T00:00:00Z', stars: 5, npmWeekly: 100, releaseDownloads: 10 },
    { date: '2026-10-01T12:00:00Z', stars: 10, npmWeekly: 0, releaseDownloads: 200 },
  ]));
  assert.equal(row.metric, 'npmWeekly');
  assert.equal(row.latest, 0);
  assert.equal(row.previous, 100);
  assert.equal(row.delta, -100);
  assert.equal(row.growthPct, -1);
  assert.equal(row.score, 0);
  assert.equal(row.spanDays, 1);
  assert.match(renderGrowth([row]), /-100%.*\(1d\)/);
  const unknown = growthRow(series('a/unknown', 'other', [{ date: '2026-10-01', stars: 1 }]));
  assert.match(renderGrowth([unknown]), /\?\s+\(\?\)/);
  assert.equal(renderSegmentsGrowth([unknown]), '细分赛道还没有增长数据。');
});

test('growth ranking orders multiple candidates before limiting and drops absent baselines', () => {
  const input = [1, 3, 2].map((factor) => series(`a/${factor}`, 'other', [
    { date: '2026-10-01', stars: 10 },
    { date: '2026-10-02', stars: 10 * (factor + 1) },
  ]));
  input.push(series('a/new', 'other', [{ date: '2026-10-02', stars: 1000 }]));
  assert.deepEqual(rankGrowth(input, 2).map((row) => row.fullName), ['a/3', 'a/2']);
  assert.deepEqual(rankGrowth(input, 0), []);
});

test('live growth ranks only known rates without mutating input and renders signs', () => {
  const rows = [
    { fullName: 'a/unknown', segment: 'other', week: 100, prev: 0, growthPct: null, score: 99 },
    { fullName: 'a/down', segment: 'other', week: 50, prev: 100, growthPct: -0.5, score: 0 },
    { fullName: 'a/up', segment: 'other', week: 200, prev: 100, growthPct: 1, score: 10 },
    { fullName: 'a/flat', segment: 'other', week: 100, prev: 100, growthPct: 0, score: 0 },
  ];
  const before = structuredClone(rows);
  assert.deepEqual(rankLiveGrowth(rows).map((row) => row.fullName), ['a/up', 'a/down', 'a/flat']);
  assert.deepEqual(rankLiveGrowth(rows, 1).map((row) => row.fullName), ['a/up']);
  assert.deepEqual(rankLiveGrowth(rows, 0), []);
  assert.deepEqual(rows, before);
  const text = renderLiveGrowth(rankLiveGrowth(rows));
  assert.match(text, /a\/up.*\+100%/);
  assert.match(text, /a\/down.*-50%/);
  assert.match(text, /a\/flat.*\+0%/);
  assert.equal(renderLiveGrowth([]), 'npm 侧本周没有正增长样本。');
});
