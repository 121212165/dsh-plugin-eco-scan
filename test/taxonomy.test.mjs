import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  VERTICALS, SECURITY_SUBCLASSES, verticalSchema, subclassSchema,
  verticalOf, subclassOf, capabilityVerticalRollup, verticalRollup, subclassRollup,
} from '../data/taxonomy.mjs';
import { indexForSlug } from '../data/tag-index.mjs';
import { RISK_LABEL } from '../data/rules.mjs';

const D = JSON.parse(readFileSync(new URL('../data/eco-data.json', import.meta.url), 'utf8'));
const { rows, meta } = D;
const row = (o = {}) => {
  const r = Array(18).fill(null);
  r[0] = 'o/dsh-stock-ticker'; r[1] = 50; r[2] = 10; r[3] = 100; r[8] = 0; r[11] = 1; r[17] = 'o'; r[9] = [];
  for (const [k, v] of Object.entries(o)) r[Number(k)] = v;
  return r;
};

test('schema exposes orthogonal vertical + security subclass dimensions', () => {
  assert.deepEqual(VERTICALS.map((v) => v.id), ['education', 'healthcare', 'finance', 'gov', 'content', 'ecommerce', 'general']);
  assert.deepEqual(SECURITY_SUBCLASSES.map((s) => s.id), ['audit', 'masking', 'access-control', 'supply-chain', 'compliance-retention']);
  assert.equal(verticalSchema().length, 7);
  assert.equal(subclassSchema().length, 5);
  assert.ok(verticalSchema().every((v) => v.id && v.name && v.definition));
});

test('verticalOf is multi-label, falls back to general, and carries the risk label', () => {
  assert.deepEqual(verticalOf(row({ 0: 'o/dsh-finance-stock-ticker' })).map((v) => v.id), ['finance']);
  assert.deepEqual(verticalOf(row({ 0: 'o/dsh-rbac-audit' })).map((v) => v.id), ['gov']);
  assert.deepEqual(verticalOf(row({ 0: 'o/dsh-unknown-thing' })).map((v) => v.id), ['general']);
  for (const v of verticalOf(row())) assert.equal(v.risk, RISK_LABEL);
});

test('subclassOf only fires on rows with the security capability tag', () => {
  const sec = indexForSlug(meta, 'security');
  assert.deepEqual(subclassOf(row({ 0: 'o/dsh-audit-log', 9: [] }), meta), []);
  const subs = subclassOf(row({ 0: 'o/dsh-audit-log', 9: [sec], 14: '能力标签：安全' }), meta);
  assert.ok(subs.some((s) => s.id === 'audit'));
  const none = subclassOf(row({ 0: 'o/dsh-security-tool', 9: [sec] }), meta);
  assert.deepEqual(none, []); // no subclass keyword -> empty (unsegmented)
});

test('rollups are reproducible: cross-tab totals and per-vertical stats recompute', () => {
  const r1 = capabilityVerticalRollup(rows, meta);
  const r2 = capabilityVerticalRollup(rows, meta);
  assert.deepEqual(r1, r2);
  assert.equal(r1.cells.length, r1.capabilities.length);
  for (const c of r1.cells) assert.equal(Object.keys(c).length, VERTICALS.length);
  const v = verticalRollup(rows, meta);
  assert.equal(v.length, VERTICALS.length);
  assert.ok(v.every((x) => x.risk === RISK_LABEL));
  // general is the fallback and therefore must be the largest bucket
  assert.equal(v.find((x) => x.id === 'general').n, Math.max(...v.map((x) => x.n)));
  const tagLevel = capabilityVerticalRollup(rows, meta, { granularity: 'tag', top: 50 });
  assert.equal(tagLevel.capabilities.length, 50);
});

test('subclass rollup covers all security-tagged rows', () => {
  const s = subclassRollup(rows, meta);
  assert.equal(s.subclasses.length, 5);
  assert.ok(s.securityTagged > 0);
  assert.ok(s.unsegmented <= s.securityTagged);
});
