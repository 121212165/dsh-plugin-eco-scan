import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openDb, schemaVersion, SCHEMA_VERSION, transaction } from '../../src/core/db.ts';
import {
  allSegments,
  getRepo,
  health,
  putMapping,
  recordAlert,
  replaceMappings,
  replaceSegments,
  snapshotsForDate,
  upsertRepo,
  writeSnapshot,
} from '../../src/core/storage.ts';
import { facts, seedRepo, tempDb } from './helpers.ts';

test('fresh database applies the v2 schema exactly once', () => {
  const { db, path } = tempDb();
  try {
    assert.equal(schemaVersion(db), SCHEMA_VERSION);
    assert.equal(SCHEMA_VERSION, 2);
    assert.ok(path.endsWith('.db'));
    assert.deepEqual(db.raw.prepare('SELECT version FROM schema_migrations').all().map((row) => (row as { version: number }).version), [2]);
    const tables = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    for (const table of ['repos', 'snapshots', 'npm_packages', 'repo_npm_map', 'repo_segments', 'scan_errors', 'alert_events']) {
      assert.ok(tables.includes(table), `${table} exists`);
    }
  } finally {
    db.close();
  }
});

test('repo upsert preserves richer fields and normalizes owner case', () => {
  const { db } = tempDb();
  try {
    upsertRepo(db, facts('Owner/Repo', { topics: ['a', 'b'], ci: true }));
    const stored = getRepo(db, 'owner/repo');
    assert.ok(stored);
    assert.deepEqual(stored.topics, ['a', 'b']);
    assert.equal(stored.ci, true);
    upsertRepo(db, facts('owner/repo', { stars: 99, ci: null, topics: [] }));
    const merged = getRepo(db, 'owner/repo');
    assert.equal(merged?.stars, 99);
    assert.equal(merged?.ci, true, 'null detail does not erase a measured value');
    assert.deepEqual(merged?.topics, []);
  } finally {
    db.close();
  }
});

test('snapshots are unique per repo per day and update in place', () => {
  const { db } = tempDb();
  try {
    seedRepo(db, 'o/r');
    writeSnapshot(db, { repoId: 'o/r', date: '2026-10-01', stars: 1, npmWeekly: 10, releaseDownloads: null, segment: 'other', segmentConfidence: 0 });
    writeSnapshot(db, { repoId: 'o/r', date: '2026-10-01', stars: 2, npmWeekly: 20, releaseDownloads: 5, segment: 'ui-client', segmentConfidence: 0.8 });
    const rows = snapshotsForDate(db, '2026-10-01');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.stars, 2);
    assert.equal(rows[0]?.segment, 'ui-client');
    assert.equal(rows[0]?.npmWeekly, 20);
  } finally {
    db.close();
  }
});

test('multi-label segments replace atomically', () => {
  const { db } = tempDb();
  try {
    seedRepo(db, 'o/r');
    replaceSegments(db, 'o/r', [
      { segment: 'cost-budget', confidence: 0.7, source: 'rules' },
      { segment: 'telemetry-analytics', confidence: 0.5, source: 'rules' },
    ]);
    assert.equal(allSegments(db).get('o/r')?.length, 2);
    replaceSegments(db, 'o/r', [{ segment: 'override-seg', confidence: 1, source: 'override' }]);
    assert.deepEqual(allSegments(db).get('o/r'), [{ segment: 'override-seg', confidence: 1, source: 'override' }]);
  } finally {
    db.close();
  }
});

test('replaceMappings clears only the requested sources', () => {
  const { db } = tempDb();
  try {
    seedRepo(db, 'o/r');
    putMapping(db, { repoId: 'o/r', npmName: 'manual-pkg', confidence: 1, source: 'manual' });
    putMapping(db, { repoId: 'o/r', npmName: 'guess-pkg', confidence: 0.4, source: 'heuristic' });
    replaceMappings(db, [{ repoId: 'o/r', npmName: 'next-pkg', confidence: 0.5, source: 'heuristic' }], ['heuristic']);
    const rows = db.raw.prepare('SELECT npm_name, source FROM repo_npm_map ORDER BY npm_name').all() as { npm_name: string; source: string }[];
    assert.deepEqual(rows.map((row) => row.npm_name), ['manual-pkg', 'next-pkg']);
  } finally {
    db.close();
  }
});

test('alert events are deduped per rule/repo/date', () => {
  const { db } = tempDb();
  try {
    seedRepo(db, 'o/r');
    assert.equal(recordAlert(db, 'rule', 'o/r', '2026-10-01', { a: 1 }), true);
    assert.equal(recordAlert(db, 'rule', 'o/r', '2026-10-01', { a: 2 }), false);
    assert.equal(recordAlert(db, 'rule', 'o/r', '2026-10-02', { a: 2 }), true);
  } finally {
    db.close();
  }
});

test('transactions roll back on error', () => {
  const { db } = tempDb();
  try {
    assert.throws(() =>
      transaction(db, () => {
        seedRepo(db, 'rollback/one');
        throw new Error('boom');
      }),
    );
    assert.equal(getRepo(db, 'rollback/one'), null);
  } finally {
    db.close();
  }
});

test('health reports counts and the last scan', () => {
  const { db, path } = tempDb();
  try {
    const report = health(db, path);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.repos, 0);
    assert.equal(report.lastScan, null);
  } finally {
    db.close();
  }
});

test('read-only connection rejects writes', () => {
  const { db, path } = tempDb();
  seedRepo(db, 'o/r');
  db.close();
  const readOnly = openDb(path, { readOnly: true });
  try {
    assert.throws(() => readOnly.raw.prepare("INSERT INTO repos (id, created_at, pushed_at, updated_at) VALUES ('x','a','b','c')").run());
  } finally {
    readOnly.close();
  }
});
