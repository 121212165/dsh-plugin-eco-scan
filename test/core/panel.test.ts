import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildExport, buildPanel } from '../../src/core/exporters.ts';
import { sparkline } from '../../src/core/panel.ts';
import { putMapping, upsertNpmPackage, writeSnapshot, writeSnapshotSegments } from '../../src/core/storage.ts';
import { seedRepo, tempDb, work } from './helpers.ts';

function seedPanel() {
  const { db } = tempDb();
  seedRepo(db, 'alice/alpha', { stars: 120 });
  seedRepo(db, 'bob/beta', { stars: 30 });
  putMapping(db, { repoId: 'alice/alpha', npmName: 'alpha-pkg', confidence: 1, source: 'manual' });
  upsertNpmPackage(db, { name: 'alpha-pkg', weekly: 200, prev: 100, growthPct: 1, fetchedAt: '2026-10-29T00:00:00.000Z' });
  for (const date of ['2026-10-27', '2026-10-28', '2026-10-29']) {
    const index = date === '2026-10-29' ? 3 : date === '2026-10-28' ? 2 : 1;
    writeSnapshot(db, {
      repoId: 'alice/alpha',
      date,
      stars: 40 * index,
      npmWeekly: 50 * index,
      releaseDownloads: 30,
      segment: 'cost-budget',
      segmentConfidence: 0.9,
    });
    writeSnapshotSegments(db, 'alice/alpha', date, [{ segment: 'cost-budget', confidence: 0.9, source: 'rules' }]);
    writeSnapshot(db, {
      repoId: 'bob/beta',
      date,
      stars: 30,
      npmWeekly: null,
      releaseDownloads: null,
      segment: 'tools-devx',
      segmentConfidence: 0.8,
    });
  }
  return db;
}

test('sparkline draws one polyline per unbroken run and never emits NaN', () => {
  const svg = sparkline([10, 20, 30]);
  assert.match(svg, /^<span class="spark-wrap"><svg /);
  assert.equal((svg.match(/<polyline/g) ?? []).length, 1);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('<title>10 → 20 → 30</title>'));
  assert.ok(svg.includes('aria-label="10 → 20 → 30"'));
  assert.ok(svg.includes('class="spark-last"'));
  assert.ok(svg.includes('<span class="spark-value" title="30">30</span>'));
});

test('sparkline treats a null as a gap, not a zero', () => {
  const svg = sparkline([10, null, 30]);
  assert.ok(!svg.includes('<polyline'), 'two isolated observations are dots, not a line through a fake zero');
  assert.equal((svg.match(/<circle/g) ?? []).length, 2);
  assert.ok(svg.includes('class="spark-gap"'));
  assert.ok(svg.includes('<title>中断</title>'));
  assert.ok(svg.includes('aria-label="10 → — → 30"'));
  const withRun = sparkline([1, 2, null, 4, 5]);
  assert.equal((withRun.match(/<polyline/g) ?? []).length, 2);
});

test('sparkline labels the complete sequence and the latest value', () => {
  const svg = sparkline([459, null, 292_400]);
  assert.ok(svg.includes('viewBox="0 0 120 24"'));
  assert.ok(svg.includes('aria-label="459 → — → 292.4k"'));
  assert.ok(svg.includes('<span class="spark-value" title="292,400">292.4k</span>'));
});

test('sparkline degrades to an em dash with fewer than two observations', () => {
  assert.equal(sparkline([null, null]), '<span class="spark-empty">—</span>');
  assert.equal(sparkline([7]), '<span class="spark-empty">—</span>');
  assert.equal(sparkline([]), '<span class="spark-empty">—</span>');
});

test('the HTML export carries a sparkline per ranked repo and a segment heatmap', () => {
  const db = seedPanel();
  const html = buildExport({ db, format: 'html', generatedAt: '2026-10-29T12:00:00.000Z' }).content;
  assert.ok(html.includes('赛道脉搏'));
  assert.ok(html.includes('class="heat"'));
  assert.equal((html.match(/class="heat-cell/g) ?? []).length, 6, '2 segments × 3 dates');
  assert.match(html, /class="heat-cell level-[0-4]"/, 'heat cells use the five-level color scale');
  assert.equal((html.match(/class="legend-swatch/g) ?? []).length, 5);
  assert.ok(html.includes('class="spark"'), 'the ranked repo has a trend line');
  assert.ok(html.includes('<title>50 → 100 → 150</title>'));
  assert.ok(html.includes('<header class="hero">'));
  assert.equal((html.match(/<section /g) ?? []).length, 3);
  assert.equal((html.match(/<caption /g) ?? []).length, 2);
  assert.ok(html.includes('<ol class="ranking">'));
  assert.ok(html.includes('<details><summary>'));
  assert.ok(!html.includes('class="badge'), 'decorative segment badges are removed');
  assert.ok(!html.includes('class="bar"'), 'score bars are removed from the ranking');
  assert.ok(!/<(?:script|link|img)\b/i.test(html), 'still no external assets or scripts');
  assert.ok(Buffer.byteLength(html, 'utf8') < 150 * 1024, 'the panel stays below 150KB');
});

test('large HTML numbers stay compact and reconcile with the JSON export', () => {
  const db = seedPanel();
  writeSnapshot(db, {
    repoId: 'alice/alpha',
    date: '2026-10-29',
    stars: 1_393_643,
    npmWeekly: 292_400,
    releaseDownloads: 30,
    segment: 'cost-budget',
    segmentConfidence: 0.9,
  });
  const generatedAt = '2026-10-29T12:00:00.000Z';
  const json = JSON.parse(buildExport({ db, format: 'json', generatedAt }).content) as {
    top: { repoId: string; stars: number; npmWeekly: number }[];
    diff: { repoId: string; npmDelta: number | null }[];
  };
  const html = buildExport({ db, format: 'html', generatedAt }).content;
  const top = json.top.find((row) => row.repoId === 'alice/alpha');
  const diff = json.diff.find((row) => row.repoId === 'alice/alpha');
  assert.equal(top?.stars, 1_393_643);
  assert.equal(top?.npmWeekly, 292_400);
  assert.equal(diff?.npmDelta, 292_300);
  assert.ok(html.includes('<td class="num" title="1,393,643">1.39M</td>'));
  assert.ok(html.includes('<td class="num" title="292,400">292.4k</td>'));
  assert.ok(html.includes('<span class="delta up" title="+292,300">▲ +292.3k</span>'));
  assert.ok(html.includes('aria-label="50 → 100 → 292.4k"'));
});

test('a panel for an empty database is well formed and says so', () => {
  const { db } = tempDb();
  const html = buildPanel(db, {}).content;
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('还没有快照'));
  assert.ok(html.includes('spark-empty'));
});

test('buildPanel writes a stable exports/panel.html and a plain HTML export stays timestamped', () => {
  const db = seedPanel();
  const dataDir = join(work, 'panel-target');
  const panel = buildPanel(db, { dataDir, generatedAt: '2026-10-29T12:34:56.000Z' });
  assert.ok(panel.path);
  assert.ok(panel.path.endsWith(join('exports', 'panel.html')));
  assert.ok(existsSync(panel.path));
  assert.equal(readFileSync(panel.path, 'utf8'), panel.content);
  const again = buildPanel(db, { dataDir, generatedAt: '2026-10-29T13:00:00.000Z' });
  assert.equal(again.path, panel.path, 'a second panel overwrites the same stable path');
  const stamped = buildExport({ db, format: 'html', dataDir, generatedAt: '2026-10-29T13:00:00.000Z' });
  assert.ok(stamped.path);
  assert.notEqual(stamped.path, panel.path);
  assert.ok(stamped.path.includes('2026-10-29T13-00-00'));
});
