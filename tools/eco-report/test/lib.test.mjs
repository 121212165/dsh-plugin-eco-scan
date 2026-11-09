import test from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, percentile, upperBound, median, cleanReadme, parseTopics, tagRepo, PRIOR } from '../lib.mjs';

test('upperBound counts values <= v in an ascending array', () => {
  const s = [1, 2, 2, 3];
  assert.equal(upperBound(s, 0), 0);
  assert.equal(upperBound(s, 2), 3);
  assert.equal(upperBound(s, 4), 4);
  assert.equal(upperBound([], 1), 0);
});

test('percentile is computed only over signal-bearing values', () => {
  const s = [10, 20, 30, 40];
  assert.equal(percentile(s, 0), 0);
  assert.equal(percentile(s, 10), 25);
  assert.equal(percentile(s, 40), 100);
  assert.equal(percentile([], 5), 0);
});

test('median handles odd, even and empty arrays', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('full coverage equals the legacy weighted score', () => {
  const r = computeScore({ stars: 10, weekly: 5, growth: 0.1, pushDays: 1, starPct: 90, reachPct: 80, growthPct: 70, activity: 60 });
  assert.equal(r.coverage, 1);
  assert.equal(r.scoreOld, 80.0);
  assert.equal(r.score, 80.0);
  assert.equal(r.lowSignal, 0);
});

test('missing signals are filled with the neutral prior, not zero', () => {
  const starOnly = computeScore({ stars: 50, weekly: null, growth: null, pushDays: null, starPct: 90, reachPct: 0, growthPct: 0, activity: 0 });
  assert.equal(starOnly.coverage, 0.4);
  assert.equal(starOnly.score, +(0.4 * 90 + 0.6 * PRIOR).toFixed(1));
  assert.equal(starOnly.lowSignal, 1);

  const noSignal = computeScore({ stars: 0, weekly: null, growth: null, pushDays: null, starPct: 0, reachPct: 0, growthPct: 0, activity: 0 });
  assert.equal(noSignal.coverage, 0);
  assert.equal(noSignal.score, 0);
  assert.equal(noSignal.lowSignal, 1);
});

test('coverage boundary: 0.5 is not low-signal, weekly=0 does not count', () => {
  const starsPlusActivity = computeScore({ stars: 1, weekly: null, growth: null, pushDays: 3, starPct: 50, reachPct: 0, growthPct: 0, activity: 50 });
  assert.equal(starsPlusActivity.coverage, 0.5);
  assert.equal(starsPlusActivity.lowSignal, 0);

  const zeroWeekly = computeScore({ stars: 1, weekly: 0, growth: null, pushDays: null, starPct: 50, reachPct: 0, growthPct: 0, activity: 0 });
  assert.equal(zeroWeekly.coverage, 0.4);
});

test('a partial-coverage repo cannot outrank a full-coverage repo with the same percentiles', () => {
  const full = computeScore({ stars: 1, weekly: 1, growth: 1, pushDays: 1, starPct: 70, reachPct: 70, growthPct: 70, activity: 70 });
  const partial = computeScore({ stars: 1, weekly: null, growth: null, pushDays: null, starPct: 70, reachPct: 0, growthPct: 0, activity: 0 });
  assert.ok(full.score > partial.score);
});

test('cleanReadme strips markup and truncates', () => {
  const raw = '```js\ncode()\n```\n<p>hello</p> ![img](x.png) [link](https://a.b) https://c.d | pipe   spaces ' + 'x'.repeat(2000);
  const out = cleanReadme(raw);
  assert.ok(!out.includes('```'));
  assert.ok(!out.includes('<p>'));
  assert.ok(!out.includes('https://'));
  assert.ok(!out.includes('|'));
  assert.ok(!/\s{2,}/.test(out));
  assert.equal(out.length, 1200);
  assert.equal(cleanReadme(null), '');
});

test('parseTopics tolerates bad input', () => {
  assert.deepEqual(parseTopics('["a","b"]'), ['a', 'b']);
  assert.deepEqual(parseTopics('not json'), []);
  assert.deepEqual(parseTopics('{"a":1}'), []);
  assert.deepEqual(parseTopics(null), []);
});

test('tagRepo ignores stop-word topics and falls back to misc', () => {
  assert.deepEqual(tagRepo('dsh-plugin-weather', '', ['dsh-plugin', 'deepseek', 'plugin']), ['misc']);
});

test('tagRepo matches capability keywords and caps at four tags', () => {
  const one = tagRepo('dsh-browser-automation', 'control chrome via playwright', []);
  assert.ok(one.includes('browser'));

  const many = tagRepo('dsh-toolkit', 'video 视频 image 图片 voice 语音 memory 记忆 rag 知识库 search 搜索', []);
  assert.equal(many.length, 4);
  assert.deepEqual(many, ['video', 'image', 'voice', 'memory']);
});
