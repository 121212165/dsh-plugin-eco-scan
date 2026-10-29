import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  deliverWebhook,
  evaluateAlerts,
  loadAlertRules,
  parseAlertRules,
  type AlertRule,
  type AlertRun,
} from '../../src/core/alerts.ts';
import { putMapping, writeSnapshot } from '../../src/core/storage.ts';
import { seedRepo, tempDb } from './helpers.ts';

const NOW = new Date('2026-10-29T00:00:00.000Z');

function event(repoId: string, date: string, weekly: number) {
  return {
    repoId,
    date,
    stars: 10,
    npmWeekly: weekly,
    releaseDownloads: null,
    segment: 'tools-devx',
    segmentConfidence: 0.9,
  };
}

function seed() {
  const { db } = tempDb();
  seedRepo(db, 'a/growing', { createdAt: '2020-01-01T00:00:00.000Z' });
  seedRepo(db, 'a/steady', { createdAt: '2020-01-01T00:00:00.000Z' });
  seedRepo(db, 'a/new', { createdAt: '2026-10-27T00:00:00.000Z' });
  seedRepo(db, 'a/old', { createdAt: '2020-01-01T00:00:00.000Z' });
  writeSnapshot(db, event('a/growing', '2026-10-28', 100));
  writeSnapshot(db, event('a/growing', '2026-10-29', 250));
  writeSnapshot(db, event('a/steady', '2026-10-28', 100));
  writeSnapshot(db, event('a/steady', '2026-10-29', 110));
  writeSnapshot(db, event('a/new', '2026-10-28', 1));
  writeSnapshot(db, event('a/new', '2026-10-29', 2));
  writeSnapshot(db, event('a/old', '2026-10-28', 5));
  writeSnapshot(db, event('a/old', '2026-10-29', 6));
  return db;
}

const RULES: AlertRule[] = [
  { id: 'surge', type: 'growth-pct', threshold: 50, minPrev: 20, maxAgeDays: null, segment: null },
  { id: 'fresh', type: 'new-repo', threshold: null, minPrev: null, maxAgeDays: 14, segment: null },
  { id: 'gap', type: 'mapping-unmatched', threshold: 1, minPrev: null, maxAgeDays: null, segment: null },
];

test('rules parse from YAML and ignore invalid entries', () => {
  const rules = parseAlertRules(`
rules:
  - id: surge
    type: growth-pct
    threshold: 75
    minPrev: 30
    segment: cost-budget
  - id: bad-type
    type: nope
  - type: new-repo
  - id: fresh
    type: new-repo
    maxAgeDays: 7
`);
  assert.deepEqual(rules, [
    { id: 'surge', type: 'growth-pct', threshold: 75, minPrev: 30, maxAgeDays: null, segment: 'cost-budget' },
    { id: 'fresh', type: 'new-repo', threshold: null, minPrev: null, maxAgeDays: 7, segment: null },
  ]);
  assert.ok(loadAlertRules(null).length >= 3, 'missing file falls back to the shipped defaults');
  assert.ok(loadAlertRules('C:/definitely/not/here.yml').length >= 3);
});

test('growth, new-repo and mapping-gap rules fire once and dedupe on rerun', () => {
  const db = seed();
  const dry = evaluateAlerts(db, RULES, { now: NOW, dryRun: true });
  assert.equal(dry.date, '2026-10-29');
  assert.equal(dry.fired.length, 3);
  assert.equal(dry.suppressed, 0);
  assert.deepEqual(dry.fired.map((event) => `${event.ruleId}:${event.repoId}`).sort(), ['fresh:a/new', 'gap:__global__', 'surge:a/growing']);
  const count = (): number => (db.raw.prepare('SELECT COUNT(*) AS n FROM alert_events').get() as { n: number }).n;
  assert.equal(count(), 0, 'dry run never persists');

  const first = evaluateAlerts(db, RULES, { now: NOW });
  assert.equal(first.fired.length, 3);
  assert.equal(count(), 3);

  const second = evaluateAlerts(db, RULES, { now: NOW });
  assert.equal(second.fired.length, 0);
  assert.equal(second.suppressed, 3);
  assert.equal(count(), 3);
});

test('growth alerts respect the minPrev floor and the segment filter', () => {
  const db = seed();
  const highFloor = evaluateAlerts(db, [{ ...RULES[0]!, minPrev: 1000 }], { now: NOW, dryRun: true });
  assert.equal(highFloor.fired.length, 0);
  assert.deepEqual(highFloor.skipped, ['surge']);

  const wrongSegment = evaluateAlerts(db, [{ ...RULES[0]!, segment: 'ui-client' }], { now: NOW, dryRun: true });
  assert.equal(wrongSegment.fired.length, 0);
});

test('new-repo alerts only cover repos visible in the evaluated snapshot', () => {
  const db = seed();
  seedRepo(db, 'a/invisible', { createdAt: '2026-10-28T00:00:00.000Z' });
  const run = evaluateAlerts(db, [RULES[1]!], { now: NOW, dryRun: true });
  assert.deepEqual(run.fired.map((event) => event.repoId), ['a/new']);
});

test('mapping gaps stay silent below the threshold and count global once', () => {
  const db = seed();
  seedRepo(db, 'a/invisible');
  for (const id of ['a/growing', 'a/steady', 'a/new', 'a/old']) {
    putMapping(db, { repoId: id, npmName: `pkg-${id.split('/')[1]}`, confidence: 1, source: 'manual' });
  }
  const quiet = evaluateAlerts(db, [RULES[2]!], { now: NOW, dryRun: true });
  assert.equal(quiet.fired.length, 0);
  assert.deepEqual(quiet.skipped, ['gap']);

  seedRepo(db, 'a/another');
  const loud = evaluateAlerts(db, [RULES[2]!], { now: NOW, dryRun: true });
  assert.equal(loud.fired[0]?.repoId, '__global__');
});

test('no snapshot means nothing fires and every rule is skipped', () => {
  const { db } = tempDb();
  const run = evaluateAlerts(db, RULES, { now: NOW });
  assert.deepEqual(run, { date: null, fired: [], suppressed: 0, skipped: ['surge', 'fresh', 'gap'] });
});

function runWith(alerts: AlertRun['fired']): AlertRun {
  return { date: '2026-10-29', fired: alerts, suppressed: 0, skipped: [] };
}

test('webhook delivery posts the run and never throws on failure', async () => {
  const payload = runWith([
    { ruleId: 'surge', repoId: 'a/growing', date: '2026-10-29', type: 'growth-pct', message: 'grew', payload: { weekly: 250 } },
  ]);
  assert.deepEqual(await deliverWebhook('', payload), { attempted: false, ok: true, status: null, error: null });

  let body = '';
  const ok = await deliverWebhook('https://hooks.test/x', payload, (async (_url, init) => {
    body = String(init?.body ?? '');
    return { ok: true, status: 200 } as Response;
  }) as typeof globalThis.fetch);
  assert.deepEqual(ok, { attempted: true, ok: true, status: 200, error: null });
  const parsed = JSON.parse(body) as { source: string; date: string; alerts: unknown[] };
  assert.equal(parsed.source, 'dsh-plugin-eco-scan');
  assert.equal(parsed.date, '2026-10-29');
  assert.equal(parsed.alerts.length, 1);

  const failed = await deliverWebhook('https://hooks.test/x', payload, (async () => ({ ok: false, status: 503 }) as Response) as typeof globalThis.fetch);
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 503);

  const thrown = await deliverWebhook('https://hooks.test/x', payload, (async () => {
    throw new Error('connection refused');
  }) as typeof globalThis.fetch);
  assert.deepEqual(thrown, { attempted: true, ok: false, status: null, error: 'connection refused' });
});
