import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { topByScore, buildDigest } from '../data/digest.mjs';

const D = JSON.parse(readFileSync(new URL('../data/eco-data.json', import.meta.url), 'utf8'));

/** Independent reference: sort ALL rows by score, take the head. */
const globalTop = (n) => [...D.rows].sort((a, b) => b[1] - a[1]).slice(0, n).map((r) => r[0]);

test('digest Top10 equals the global score Top10', () => {
  assert.deepEqual(topByScore(D.rows, 10).map((r) => r[0]), globalTop(10));
});

test('digest Top60 equals the global score Top60 (no hidden isEnriched/star filter)', () => {
  assert.deepEqual(topByScore(D.rows, 60).map((r) => r[0]), globalTop(60));
  // regression guard for issue #12: these used to be dropped by the bogus filter
  assert.ok(globalTop(10).includes('lijiaqi-ai-product-manager/dsh-agent-compare'));
  assert.ok(!topByScore(D.rows.filter((r) => r[10] === 1 || r[2] > 2000), 10).map((r) => r[0]).includes('lijiaqi-ai-product-manager/dsh-agent-compare'));
});

test('rendered digest title and rendered head match the global ranking', () => {
  const out = buildDigest(D);
  assert.match(out, /## TOP 60 BY SCORE \(global, all rows\)/);
  assert.match(out, /榜单口径已修正（2026-11-20）/);
  const head = out.split('## TOP 60 BY SCORE (global, all rows)\n')[1]
    .split('\n').filter((line) => /^\d+\. /.test(line)).slice(0, 10);
  const expected = globalTop(10);
  assert.equal(head.length, 10);
  head.forEach((line, i) => assert.ok(line.includes(expected[i]), `rank ${i + 1} should be ${expected[i]}`));
});
