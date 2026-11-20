import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  OUTLIER, isGrowthOutlier, growthCoverage, growthCoverageNote,
  rankGrowthSafe, growthFlag,
} from '../data/growth-quality.mjs';

const D = JSON.parse(readFileSync(new URL('../data/eco-data.json', import.meta.url), 'utf8'));
const { rows } = D;
const row = (o = {}) => {
  const r = Array(18).fill(null);
  r[0] = 'o/r'; r[1] = 50; r[2] = 500; r[3] = 100; r[4] = 10; r[11] = 1; r[17] = 'o';
  for (const [k, v] of Object.entries(o)) r[Number(k)] = v;
  return r;
};

test('outlier rule is |growth|>100 AND stars<100 (both conditions required)', () => {
  assert.equal(OUTLIER.ABS_PCT, 100);
  assert.equal(isGrowthOutlier(row({ 4: 2607.4, 2: 10 })), true);
  assert.equal(isGrowthOutlier(row({ 4: -150, 2: 0 })), true);
  assert.equal(isGrowthOutlier(row({ 4: 150, 2: 500 })), false, 'high-star repo is not a small-base outlier');
  assert.equal(isGrowthOutlier(row({ 4: 100, 2: 10 })), false, 'exactly 100 is boundary, not >100');
  assert.equal(isGrowthOutlier(row({ 4: null, 2: 0 })), false);
  assert.equal(growthFlag(row({ 4: 2607.4, 2: 10 })), ' ⚠异常(未清洗)');
});

test('safe growth ranking excludes raw outliers but keeps valid large repos', () => {
  const input = [
    row({ 0: 'o/outlier', 4: 2607.4, 2: 10 }),
    row({ 0: 'o/valid', 4: 300, 2: 900 }),
    row({ 0: 'o/negative', 4: -5, 2: 900 }),
    row({ 0: 'o/null', 4: null, 2: 900 }),
  ];
  assert.deepEqual(rankGrowthSafe(input).map((r) => r[0]), ['o/valid']);
});

test('real snapshot growth coverage and extreme values match the confirmed figures', () => {
  const s = growthCoverage(rows);
  assert.equal(s.total, 38549);
  assert.equal(s.withGrowth, 5639);
  assert.equal(s.missing, 32910);
  assert.equal(s.coveragePct, '14.6');
  assert.equal(s.max, 2607.4);
  assert.equal(s.over100, 150);
  assert.equal(s.outlier, 145);
});

test('every coverage note carries n, percent and the non-total caveat', () => {
  const note = growthCoverageNote(rows);
  assert.match(note, /n=5,639/);
  assert.match(note, /覆盖 14\.6%/);
  assert.match(note, /不可当全量结论/);
  assert.ok(rankGrowthSafe(rows, 15).every((r) => !isGrowthOutlier(r)));
});
