import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { migrateV1, parseV1Line, v1Files } from '../../src/core/migrate.ts';
import { getRepo, meta, replaceSegments, segmentsForRepo, snapshotCount, snapshotsForDate } from '../../src/core/storage.ts';
import { tempDb, seedRepo, work } from './helpers.ts';

function dir(name: string): string {
  const path = join(work, `v1-${name}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path, { recursive: true });
  return path;
}

function line(record: Record<string, unknown>): string {
  return JSON.stringify(record);
}

test('parseV1Line accepts only well-formed v1 records', () => {
  assert.deepEqual(
    parseV1Line(line({ v: 1, date: '2026-09-01', fullName: 'Alice/Eco-Scan', segment: 'cost-budget', stars: 10, npmWeekly: 3 })),
    { date: '2026-09-01', fullName: 'Alice/Eco-Scan', segment: 'cost-budget', stars: 10, npmWeekly: 3, releaseDownloads: null },
  );
  assert.equal(parseV1Line(line({ v: 2, date: '2026-09-01', fullName: 'a/b', stars: 1 })), null);
  assert.equal(parseV1Line(line({ v: 1, fullName: 'a/b', stars: 1 })), null, 'date is required');
  assert.equal(parseV1Line('not json'), null);
  assert.equal(parseV1Line('   '), null);
});

test('v1Files only picks monthly snapshot files', () => {
  const path = dir('listing');
  writeFileSync(join(path, 'snapshots-2026-09.jsonl'), '', 'utf8');
  writeFileSync(join(path, 'snapshots-2026-10.jsonl'), '', 'utf8');
  writeFileSync(join(path, 'snapshots-2026-9.jsonl'), '', 'utf8');
  writeFileSync(join(path, 'notes.txt'), '', 'utf8');
  assert.deepEqual(
    v1Files(path).map((file) => file.split(/[\\/]/).pop()),
    ['snapshots-2026-09.jsonl', 'snapshots-2026-10.jsonl'],
  );
  assert.deepEqual(v1Files(join(path, 'missing')), []);
});

test('migration writes repos, snapshots and legacy segments once', () => {
  const path = dir('roundtrip');
  writeFileSync(
    join(path, 'snapshots-2026-09.jsonl'),
    [
      line({ v: 1, date: '2026-09-01', fullName: 'Alice/Eco-Scan', segment: 'cost-budget', stars: 120, npmWeekly: 300, releaseDownloads: 40 }),
      'garbage',
      line({ v: 1, date: '2026-09-01', fullName: 'bob/telemetry', segment: 'telemetry-analytics', stars: 9, npmWeekly: null }),
      line({ v: 2, date: '2026-09-01', fullName: 'carol/ignored', stars: 1 }),
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(path, 'snapshots-2026-10.jsonl'),
    line({ v: 1, date: '2026-10-01', fullName: 'Alice/Eco-Scan', segment: 'cost-budget', stars: 150, npmWeekly: 420 }),
    'utf8',
  );

  const { db } = tempDb();
  const result = migrateV1(db, path);
  assert.deepEqual({ ...result, files: result.files }, { files: 2, records: 3, skipped: 2, repos: 2, dates: 2, alreadyMigrated: false });

  const fresh = getRepo(db, 'alice/eco-scan');
  assert.ok(fresh, 'repo ids are normalized to lower-case');
  assert.equal(fresh.stars, 150, 'the newest snapshot wins the legacy star count');
  assert.equal(snapshotsForDate(db, '2026-09-01').length, 2);
  assert.equal(snapshotsForDate(db, '2026-10-01').length, 1);
  assert.deepEqual(segmentsForRepo(db, 'alice/eco-scan'), [{ segment: 'cost-budget', confidence: 0.5, source: 'legacy' }]);
  assert.ok(meta(db, 'v1-migrated-at'));
  assert.equal(meta(db, 'v1-migrated-dir'), path);

  const second = migrateV1(db, path);
  assert.equal(second.alreadyMigrated, true);
  assert.equal(second.records, 0);
  assert.equal(snapshotCount(db), 3, 'a second run cannot duplicate history');

  const forced = migrateV1(db, path, { force: true });
  assert.equal(forced.records, 3);
  assert.equal(snapshotCount(db), 3, 'INSERT … DO NOTHING keeps the table idempotent');
});

test('migration never downgrades labels a v2 scan already wrote', () => {
  const path = dir('labels');
  writeFileSync(
    join(path, 'snapshots-2026-10.jsonl'),
    line({ v: 1, date: '2026-10-01', fullName: 'alice/two-labels', segment: 'cost-budget', stars: 1, npmWeekly: 5 }),
    'utf8',
  );
  const { db } = tempDb();
  seedRepo(db, 'alice/two-labels');
  replaceSegments(db, 'alice/two-labels', [
    { segment: 'memory-context', confidence: 0.9, source: 'rules' },
    { segment: 'tools-devx', confidence: 0.4, source: 'rules' },
  ]);
  migrateV1(db, path);
  assert.deepEqual(
    segmentsForRepo(db, 'alice/two-labels').map((label) => label.segment),
    ['memory-context', 'tools-devx'],
    'legacy backfill only fills repos the new scanner has never labelled',
  );
});

test('migration on an empty directory still records the marker', () => {
  const { db } = tempDb();
  const result = migrateV1(db, dir('empty'));
  assert.equal(result.records, 0);
  assert.equal(result.repos, 0);
  assert.ok(meta(db, 'v1-migrated-at'));
  assert.equal(migrateV1(db, dir('empty')).alreadyMigrated, true);
});