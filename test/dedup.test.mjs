import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  FARM_OWNER_THRESHOLD, normaliseBase, countOwners, isFarmRow,
  basenameClusters, sameOwnerClusters, dedupView,
  verificationBadge, applyVerificationFilter, dedupStats,
} from '../data/dedup.mjs';

const D = JSON.parse(readFileSync(new URL('../data/eco-data.json', import.meta.url), 'utf8'));
const { rows } = D;
const owners = countOwners(rows);
const row = (o = {}) => {
  const r = Array(18).fill(null);
  r[0] = 'o/r'; r[1] = 50; r[2] = 10; r[3] = 100; r[8] = 0; r[11] = 1; r[17] = 'o';
  for (const [k, v] of Object.entries(o)) r[Number(k)] = v;
  return r;
};

test('normaliseBase strips dsh-/plugin/version/punctuation', () => {
  assert.equal(normaliseBase('a/dsh-purge'), 'purge');
  assert.equal(normaliseBase('a/dsh-plugin-guard'), 'pluginguard');
  assert.equal(normaliseBase('a/dsh-guard'), 'guard');
  assert.equal(normaliseBase('a/kush-coder/autopilot-eac-desktop-v6'), 'autopiloteacdesktop');
});

test('farm rows are only owners above the 100-repo threshold', () => {
  const c = countOwners([row({ 17: 'a' }), row({ 17: 'a' }), row({ 17: 'b' })]);
  assert.equal(isFarmRow(row({ 17: 'a' }), new Map([['a', 101]])), true);
  assert.equal(isFarmRow(row({ 17: 'a' }), c), false);
  assert.equal(FARM_OWNER_THRESHOLD, 100);
});

test('verification badge levels and one-click filter (synthetic)', () => {
  const c = new Map([['farm', 200], ['ok', 2], ['star', 2], ['none', 2]]);
  assert.equal(verificationBadge(row({ 17: 'ok' }), c).level, 'verified'); // download + star
  assert.equal(verificationBadge(row({ 17: 'farm' }), c).level, 'farm');
  assert.equal(verificationBadge(row({ 17: 'star', 3: null }), c).level, 'weak');
  assert.equal(verificationBadge(row({ 17: 'none', 3: null, 2: 0 }), c).level, 'unverified');
  const filtered = applyVerificationFilter([row({ 17: 'farm' }), row({ 17: 'ok' })], c, { requireDownloads: true, excludeFarm: true });
  assert.deepEqual(filtered.map((r) => r[17]), ['ok']);
});

test('real snapshot: five farm owners, uckkk holds 1296 repos and 1006 clones', () => {
  const s = dedupStats(rows);
  assert.equal(s.farmOwners, 5);
  assert.equal(s.farmRows, 1905);
  assert.deepEqual(s.farms.map((f) => f.owner), ['uckkk', 'xby-skill', 'perrylink', 'feely0208', 'omdsh-dev']);
  assert.equal(owners.get('uckkk'), 1296);
  assert.equal(rows.filter((r) => r[17] === 'uckkk' && r[1] === 48.8).length, 1006);
  assert.equal(isFarmRow(rows.find((r) => r[17] === 'uckkk'), owners), true);
});

test('real snapshot: basename collisions and dedup collapse are reproducible', () => {
  const base = new Map(basenameClusters(rows).map((c) => [c.basename, c]));
  assert.ok(base.get('purge').n >= 24, `dsh-purge cluster = ${base.get('purge')?.n}`);
  assert.ok(base.get('pluginguard').n >= 14, `dsh-plugin-guard cluster = ${base.get('pluginguard')?.n}`);
  assert.ok(base.get('guard').n >= 8, `dsh-guard cluster = ${base.get('guard')?.n}`);
  assert.ok(sameOwnerClusters(rows).length >= 40, `same-owner clusters = ${sameOwnerClusters(rows).length}`);
  const view = dedupView(rows);
  assert.equal(view.filter((v) => v.duplicate).length, basenameClusters(rows).length);
  for (const v of view) {
    assert.ok(v.representative[1] >= Math.max(...v.hidden.map((r) => r[1]), -Infinity));
  }
});
