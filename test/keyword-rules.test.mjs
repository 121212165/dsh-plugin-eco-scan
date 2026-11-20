import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  RISK_LABEL, REGRESSION_CASES, classifyByRule, semanticVerify,
  verifiedClassification, renderRuleRegression,
} from '../data/rules.mjs';

const D = JSON.parse(readFileSync(new URL('../data/eco-data.json', import.meta.url), 'utf8'));
const { rows, meta } = D;
const byId = new Map(rows.map((r) => [r[0], r]));
const row = (o = {}) => {
  const r = Array(18).fill(null);
  r[0] = 'o/dsh-stock-ticker'; r[1] = 50; r[2] = 10; r[3] = 100; r[8] = 0; r[11] = 1; r[17] = 'o'; r[9] = [];
  for (const [k, v] of Object.entries(o)) r[Number(k)] = v;
  return r;
};

test('five known false positives are all excluded (basename-only + exclusion list)', () => {
  assert.equal(REGRESSION_CASES.length, 5);
  for (const c of REGRESSION_CASES) {
    const r = byId.get(c.id);
    assert.ok(r, `regression fixture missing: ${c.id}`);
    const cls = classifyByRule(r);
    const hit = cls.hits.find((h) => h.keyword === c.keyword);
    // A hit may be absent entirely when the FP came from the owner name —
    // basename-only matching removes it before any rule fires.
    if (hit) assert.equal(hit.status, 'excluded', `${c.id}: ${c.why}`);
    assert.ok(!cls.verticals.includes(c.vertical), `${c.id} must not be tagged ${c.vertical}`);
  }
  const report = renderRuleRegression(rows);
  assert.match(report, /5\/5 通过/);
  assert.ok(!report.includes('| FAIL |'));
});

test('keyword hits always carry a confidence and the unverified risk label', () => {
  const finance = row({ 0: 'o/dsh-finance-stock' });
  const hits = classifyByRule(finance).hits;
  assert.ok(hits.length > 0);
  for (const h of hits) {
    assert.equal(typeof h.confidence, 'number');
    assert.ok(h.confidence > 0 && h.confidence <= 1);
    assert.equal(h.risk, RISK_LABEL);
  }
  assert.equal(classifyByRule(row({ 0: 'o/dsh-random-tool' })).status, 'no-hit');
});

test('semantic verification needs description; confirms only capability-coherent hits', () => {
  const c = classifyByRule(row({ 0: 'o/dsh-finance-stock' }));
  const noDesc = semanticVerify(row({ 0: 'o/dsh-finance-stock' }), meta, c);
  assert.equal(noDesc.status, 'unavailable');

  const tagged = row({
    0: 'o/dsh-finance-stock', 9: [47],
    14: 'README/npm 关键词补全的能力标签：金融/行情；主赛道 金融；score 50，coverage 1。',
  });
  const v = verifiedClassification(tagged, meta);
  assert.equal(v.finalStatus, 'confirmed');
  assert.ok(v.verification.evidence.some((e) => e.vertical === 'finance'));
  assert.ok(v.verification.confidence >= 0.9);
});

test('tool-metaphor healthcare stays excluded even with a description', () => {
  const doctor = row({
    0: 'o/dsh-memory-doctor', 9: [5],
    14: 'README/npm 关键词补全的能力标签：记忆；主赛道 认知；score 50，coverage 1。',
  });
  const v = verifiedClassification(doctor, meta);
  assert.equal(v.status, 'excluded');
  assert.equal(v.finalStatus, 'excluded');
  assert.ok(!v.verticals.includes('healthcare'));
});

test('real snapshot: keyword hits are reported as unverified, never as domain totals', () => {
  const digest = readFileSync(new URL('../data/digest.md', import.meta.url), 'utf8');
  assert.match(digest, /## DOMAIN KEYWORD HITS — 未校验，不得当领域总量 \(issue #18\)/);
  assert.match(digest, /## KEYWORD REGRESSION — 5 known false positives \(issue #18\)/);
  assert.match(digest, /## KEYWORD TAGGING RULES \(issue #18\)/);
  const counts = rows.filter((r) => r[14] == null).length;
  assert.equal(counts, 38549 - 174, 'only enriched rows have a description');
});
