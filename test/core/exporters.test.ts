import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildExport } from '../../src/core/exporters.ts';
import { putMapping, upsertNpmPackage, writeSnapshot } from '../../src/core/storage.ts';
import { seedRepo, tempDb, work } from './helpers.ts';

function seed() {
  const { db } = tempDb();
  seedRepo(db, 'alice/alpha', { stars: 120, description: 'quotes "here" & <script>alert(1)</script>' });
  seedRepo(db, 'bob/beta', { stars: 30, description: 'plain' });
  putMapping(db, { repoId: 'alice/alpha', npmName: 'alpha-pkg', confidence: 1, source: 'manual' });
  upsertNpmPackage(db, { name: 'alpha-pkg', weekly: 200, prev: 100, growthPct: 1, fetchedAt: '2026-10-29T00:00:00.000Z' });
  for (const date of ['2026-10-28', '2026-10-29']) {
    writeSnapshot(db, {
      repoId: 'alice/alpha',
      date,
      stars: date === '2026-10-29' ? 120 : 100,
      npmWeekly: date === '2026-10-29' ? 200 : 100,
      releaseDownloads: 30,
      segment: 'cost-budget',
      segmentConfidence: 0.9,
    });
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

test('JSON report carries v2, coverage percentages and the scored top', () => {
  const db = seed();
  const result = buildExport({ db, format: 'json', generatedAt: '2026-10-29T12:00:00.000Z' });
  assert.equal(result.path, null, 'no dataDir means no file');
  const report = JSON.parse(result.content) as {
    v: number;
    date: string;
    coverage: { repos: number; mapped: number; mappedPct: number; weeklyPct: number };
    segments: unknown[];
    top: { repoId: string; score: number }[];
    diff: { repoId: string; npmDelta: number | null }[];
  };
  assert.equal(report.v, 2);
  assert.equal(report.date, '2026-10-29');
  assert.equal(report.coverage.repos, 2);
  assert.equal(report.coverage.mapped, 1);
  assert.equal(report.coverage.mappedPct, 50);
  assert.equal(report.coverage.weeklyPct, 50);
  assert.equal(report.top.length, 1, 'beta has no weekly baseline and is excluded from the top');
  assert.equal(report.top[0]?.repoId, 'alice/alpha');
  assert.equal(report.segments.length, 2);
  assert.equal(report.diff.find((row) => row.repoId === 'alice/alpha')?.npmDelta, 100);
});

test('JSONL stays v1-readable and adds the v2 fields for every snapshot', () => {
  const db = seed();
  const lines = buildExport({ db, format: 'jsonl' }).content.split('\n').filter(Boolean);
  assert.equal(lines.length, 2, 'the audit trail carries every repo scanned that day, not just the ranked top');
  const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.deepEqual(records.map((record) => record.fullName).sort(), ['alice/alpha', 'bob/beta']);
  for (const record of records) {
    assert.equal(record.v, 2);
    assert.equal(record.date, '2026-10-29');
    assert.ok(typeof record.stars === 'number');
    assert.ok('segmentConfidence' in record);
    assert.ok('npmRangeWeek' in record);
    assert.ok('npmRangePrev' in record);
  }
  const alpha = records.find((record) => record.fullName === 'alice/alpha');
  assert.ok(alpha);
  assert.equal(alpha.segmentConfidence, 0.9);
  assert.equal(alpha.npmRangeWeek, 200);
  assert.equal(alpha.npmRangePrev, 100);
  const beta = records.find((record) => record.fullName === 'bob/beta');
  assert.ok(beta);
  assert.equal(beta.npmRangeWeek, null, 'an unmapped repo has no npm range');
});

test('CSV quotes embedded quotes and keeps a stable header', () => {
  const db = seed();
  const csv = buildExport({ db, format: 'csv' }).content.split('\n');
  assert.equal(
    csv[0],
    'date,repo,segment,score,velocity,adoption,quality,maintenance,stars,npm_weekly,release_downloads,cohort,rank,insufficient,outlier,description',
  );
  const alpha = csv.find((line) => line.includes('alice/alpha'));
  assert.ok(alpha, 'the alpha row is present in the CSV');
  assert.ok(alpha.includes('"quotes ""here"" & <script>alert(1)</script>"'));
});

test('Markdown renders segment and top tables plus the delta section', () => {
  const db = seed();
  const md = buildExport({ db, format: 'md' }).content;
  assert.ok(md.startsWith('# dsh 插件生态报告 2026-10-29'));
  assert.ok(md.includes('| 赛道 | 仓库 | ★ | 周下载 | 中位 ★ |'));
  assert.ok(md.includes('| alice/alpha | cost-budget |'));
  assert.ok(md.includes('## 变化'), 'a npm delta exists so the delta table is rendered');
});

test('HTML is self-contained and escapes text taken from the database', () => {
  const db = seed();
  seedRepo(db, 'evil/segment');
  writeSnapshot(db, {
    repoId: 'evil/segment',
    date: '2026-10-29',
    stars: 1,
    npmWeekly: 10,
    releaseDownloads: 0,
    segment: '<script>alert(2)</script>',
    segmentConfidence: 1,
  });
  const html = buildExport({ db, format: 'html' }).content;
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), 'segment labels are escaped');
  assert.ok(!html.includes('<script>alert('));
  assert.ok(html.includes('class="ranking"'));
  assert.ok(html.includes('npm 映射覆盖'));
  assert.ok(!/<link |<script /.test(html), 'no external assets or scripts');
});

test('writes the export under <dataDir>/exports when asked', () => {
  const db = seed();
  const dataDir = join(work, 'export-target');
  const result = buildExport({ db, format: 'md', dataDir, generatedAt: '2026-10-29T12:34:56.000Z' });
  assert.ok(result.path);
  assert.ok(result.path.startsWith(join(dataDir, 'exports')));
  assert.ok(existsSync(result.path));
  assert.equal(readFileSync(result.path, 'utf8'), result.content);
  assert.ok(result.path.endsWith('.md'));
});

test('an empty database still produces a well-formed report', () => {
  const { db } = tempDb();
  const json = JSON.parse(buildExport({ db, format: 'json' }).content) as { date: null; top: unknown[]; coverage: { repos: number; mappedPct: number } };
  assert.equal(json.date, null);
  assert.deepEqual(json.top, []);
  assert.equal(json.coverage.repos, 0);
  assert.equal(json.coverage.mappedPct, 0);
  assert.equal(buildExport({ db, format: 'jsonl' }).content, '');
  assert.ok(buildExport({ db, format: 'md' }).content.includes('(no snapshot)'));
});
