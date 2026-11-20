import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  HIGH_DOWNLOAD_MIN, RETENTION_FIELDS, snapshotRetentionAvailability,
  retentionProxy, isRetentionRisk, riskFlag, retentionStats, RISK_LABEL,
} from '../data/retention.mjs';

const D = JSON.parse(readFileSync(new URL('../data/eco-data.json', import.meta.url), 'utf8'));
const { rows, meta } = D;
const byId = new Map(rows.map((r) => [r[0], r]));

test('retention proxy formulas and null semantics', () => {
  assert.equal(RETENTION_FIELDS.length, 3);
  const p = retentionProxy({ installsNew: 80, installsReturning: 20, weeklyPrev: 100, weekly: 90 });
  assert.equal(p.returningShare, 0.2);
  assert.equal(p.reinstallRatio, 0.2);
  assert.equal(p.continuity, 0.9);
  assert.equal(p.status, 'available');
  assert.match(p.caveat, /非活跃用户数/);
  const missing = retentionProxy({});
  assert.equal(missing.returningShare, null);
  assert.equal(missing.status, 'unavailable');
  assert.equal(retentionProxy({ installsNew: 0, installsReturning: 0 }).returningShare, null);
  assert.equal(retentionProxy({ installsNew: 10, installsReturning: 5, weeklyPrev: 0 }).reinstallRatio, null);
});

test('current snapshot has no continuous install fields -> proxy unavailable', () => {
  const a = snapshotRetentionAvailability(meta);
  assert.equal(a.available, false);
  assert.ok(a.fields.every((f) => f.present === false));
  assert.match(a.note, /待连续快照/);
});

test('retention risk requires high downloads AND negative growth', () => {
  assert.equal(HIGH_DOWNLOAD_MIN, 1000);
  const risky = byId.get('pc2005-cloud/dsh-pet');
  assert.equal(isRetentionRisk(risky), true);
  assert.equal(riskFlag(risky), ` ${RISK_LABEL}`);
  assert.equal(isRetentionRisk(byId.get('lijiaqi-ai-product-manager/dsh-agent-compare')), false);
  const s = retentionStats(rows, meta.downloadTop);
  assert.equal(s.downloadTopNegative, 11);
  assert.equal(s.downloadTopTotal, 20);
  assert.ok(s.riskyCount > 0);
  assert.equal(s.named.length, 3);
  assert.ok(s.named.every((x) => x.flagged === true), 'all three named cases must be flagged');
  assert.deepEqual(s.named.map((x) => x.growth), [-33.4, -25.7, -23.2]);
});

test('digest annotates download top and states download=install proxy', () => {
  const digest = readFileSync(new URL('../data/digest.md', import.meta.url), 'utf8');
  assert.match(digest, /## RETENTION PROXY & RISK \(issue #22\)/);
  assert.match(digest, /下载 = 装机代理，非活跃用户数/);
  assert.match(digest, /pc2005-cloud\/dsh-pet.*存量留存风险/);
  assert.match(digest, /不列入首选推荐/);
});
