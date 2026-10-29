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
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/<polyline/g) ?? []).length, 1);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('<title>10 → 20 → 30</title>'));
});

test('sparkline treats a null as a gap, not a zero', () => {
  const svg = sparkline([10, null, 30]);
  assert.ok(!svg.includes('<polyline'), 'two isolated observations are dots, not a line through a fake zero');
  assert.equal((svg.match(/<circle/g) ?? []).length, 2);
  const withRun = sparkline([1, 2, null, 4, 5]);
  assert.equal((withRun.match(/<polyline/g) ?? []).length, 2);
});

test('sparkline degrades to an em dash with fewer than two observations', () => {
  assert.equal(sparkline([null, null]), '<span class="spark-empty">—</span>');
  assert.equal(sparkline([7]), '<span class="spark-empty">—</span>');
  assert.equal(sparkline([]), '<span class="spark-empty">—</span>');
});

test('the HTML export carries a sparkline per ranked repo and a segment heatmap', () => {
  const db = seedPanel();
  const html = buildExport({ db, format: 'html', generatedAt: '2026-10-29T12:00:00.000Z' }).content;
  assert.ok(html.includes('赛道热度'));
  assert.ok(html.includes('class="heat"'));
  assert.equal((html.match(/class="heat-cell/g) ?? []).length, 6, '2 segments × 3 dates');
  assert.ok(html.includes('rgba(var(--accent-rgb)'), 'heat cells are shaded by value');
  assert.ok(html.includes('class="spark"'), 'the ranked repo has a trend line');
  assert.ok(html.includes('<title>50 → 100 → 150</title>'));
  assert.ok(!/<link |<script /.test(html), 'still no external assets or scripts');
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
