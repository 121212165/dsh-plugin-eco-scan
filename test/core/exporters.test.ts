import assert from 'node:assert/strict';
import fs, { existsSync, readFileSync, readdirSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { buildExport, buildPanel } from '../../src/core/exporters.ts';
import { putMapping, upsertNpmPackage, writeSnapshot } from '../../src/core/storage.ts';
import { seedRepo, tempDb, work } from './helpers.ts';

const generatedAt = '2026-10-29T12:34:56.000Z';
beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(generatedAt) }));
afterEach(() => mock.timers.reset());

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

for (const format of ['json', 'jsonl', 'csv', 'md', 'html'] as const) {
  test(`${format} writes deterministic empty and populated exports with the correct extension`, () => {
    const { db: empty } = tempDb();
    const dataDir = join(work, `formats-${format}`);
    for (const [db, date] of [[empty, null], [seed(), '2026-10-29']] as const) {
      const result = buildExport({ db, format, dataDir });
      assert.equal(result.format, format);
      assert.equal(result.date, date);
      assert.equal(result.path, join(dataDir, 'exports', `eco-${date ?? 'empty'}-2026-10-29T12-34-56.${format}`));
      assert.equal(readFileSync(result.path!, 'utf8'), result.content);
      assert.equal(buildExport({ db, format, generatedAt }).content, result.content);
      if (!date && format === 'csv') assert.equal(result.content.split('\n').length, 1);
      if (!date && format === 'html') assert.match(result.content, /还没有快照/);
      if (!date && format === 'md') assert.ok(!result.content.includes('## 变化'));
      if (!date && format === 'json') {
        const report = JSON.parse(result.content);
        assert.equal(report.generatedAt, generatedAt);
        assert.deepEqual(report.coverage, { repos: 0, mapped: 0, withWeekly: 0, withReleases: 0, mappedPct: 0, weeklyPct: 0 });
      }
    }
    assert.equal(readdirSync(join(dataDir, 'exports')).length, 2, 'successful writes leave no temporary file');
  });
}

test('explicit dates and clamped top limits do not truncate the JSONL audit trail', () => {
  const db = seed();
  for (const date of ['2026-10-28', '2026-10-29']) {
    writeSnapshot(db, { repoId: 'bob/beta', date, stars: 30, npmWeekly: 100, releaseDownloads: null, segment: 'tools-devx', segmentConfidence: 0.8 });
  }
  for (const limit of [-1, 0, 1, 2]) {
    const report = JSON.parse(buildExport({ db, format: 'json', limit }).content);
    assert.equal(report.top.length, Math.max(1, limit));
    const audit = buildExport({ db, format: 'jsonl', limit, date: '2026-10-28' }).content.split('\n').map((line) => JSON.parse(line));
    assert.equal(audit.length, 2);
    assert.ok(audit.every((row) => row.date === '2026-10-28'));
    assert.equal(audit.find((row) => row.fullName === 'alice/alpha').npmWeekly, 100);
  }
  const older = JSON.parse(buildExport({ db, format: 'json', date: '2026-10-28' }).content);
  assert.equal(older.date, '2026-10-28');
  assert.equal(older.top[0].npmWeekly, 100);
  const missing = JSON.parse(buildExport({ db, format: 'json', date: '2026-01-01' }).content);
  assert.equal(missing.date, '2026-01-01');
  assert.deepEqual(missing.top, []);
  assert.deepEqual(missing.diff, []);
});

test('CSV handles commas, quotes, newlines and null metrics; Markdown escapes table cells', () => {
  const db = seed();
  seedRepo(db, 'alice/alpha', { description: 'comma, "quoted"\nnext line' });
  writeSnapshot(db, {
    repoId: 'alice/alpha', date: '2026-10-29', stars: 120, npmWeekly: 200,
    releaseDownloads: null, segment: 'cost|budget\nnext', segmentConfidence: 0.9,
  });
  const csv = buildExport({ db, format: 'csv' }).content;
  assert.match(csv, /,200,,/);
  assert.ok(csv.endsWith(',false,false,"comma, ""quoted""\nnext line"'));
  assert.ok(csv.includes('"cost|budget\nnext"'));
  const md = buildExport({ db, format: 'md' }).content;
  assert.ok(md.includes('| cost\\|budget next |'));
  assert.ok(!md.includes('cost|budget\nnext'));
  assert.ok(md.includes('| alice/alpha | 100 | 20 |'));
  assert.ok(!md.includes('| bob/beta |'), 'rows without an npm baseline are excluded from top and delta tables');
});

test('stable panel replacement renames a complete sibling file over the old report', (t) => {
  const db = seed();
  const dataDir = join(work, 'atomic-panel');
  const first = buildPanel(db, { dataDir, generatedAt });
  assert.ok(first.path);
  const expected = buildPanel(db, { date: '2026-10-28', limit: 1, generatedAt: '2026-10-29T13:00:00.000Z' }).content;
  const rename = fs.renameSync;
  const spy = t.mock.method(fs, 'renameSync', (...args: Parameters<typeof fs.renameSync>) => {
    const [from, to] = args;
    assert.equal(to, first.path);
    assert.notEqual(from, to);
    assert.equal(dirname(String(from)), dirname(String(to)), 'rename stays on the same filesystem');
    assert.equal(readFileSync(to, 'utf8'), first.content, 'old report survives until the rename');
    assert.equal(readFileSync(from, 'utf8'), expected, 'new report is complete before replacing the target');
    rename(...args);
  });
  syncBuiltinESMExports();
  try {
    const second = buildPanel(db, { dataDir, date: '2026-10-28', limit: 1, generatedAt: '2026-10-29T13:00:00.000Z' });
    assert.equal(second.path, first.path);
    assert.equal(spy.mock.callCount(), 1);
    assert.equal(readFileSync(second.path!, 'utf8'), expected);
    assert.deepEqual(readdirSync(dirname(second.path!)), ['panel.html']);
  } finally {
    spy.mock.restore();
    syncBuiltinESMExports();
  }
});

for (const stage of ['write', 'rename'] as const) {
  test(`failed ${stage} preserves the previous export and propagates the error`, (t) => {
    const db = seed();
    const dataDir = join(work, `atomic-failure-${stage}`);
    const first = buildExport({ db, format: 'json', dataDir, generatedAt });
    assert.ok(first.path);
    const error = new Error(`injected ${stage} failure`);
    const write = fs.writeFileSync;
    const spy = stage === 'write'
      ? t.mock.method(fs, 'writeFileSync', (...args: Parameters<typeof fs.writeFileSync>) => {
          write(args[0], 'partial report', 'utf8');
          throw error;
        })
      : t.mock.method(fs, 'renameSync', () => { throw error; });
    syncBuiltinESMExports();
    try {
      assert.throws(() => buildExport({ db, format: 'json', dataDir, generatedAt }), (caught) => caught === error);
      assert.equal(spy.mock.callCount(), 1);
      assert.equal(readFileSync(first.path, 'utf8'), first.content);
      assert.doesNotThrow(() => JSON.parse(readFileSync(first.path!, 'utf8')));
    } finally {
      spy.mock.restore();
      syncBuiltinESMExports();
    }
  });
}
