import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { SegmentBook, applyOverride } from '../../src/core/segmentation.ts';
import { work } from './helpers.ts';

const RULES = `
segments:
  - id: cost
    label: 成本与预算
    weight: 1
    keywords: [billing, budget, cost]
    topics: [billing]
    namePatterns: ['(^|-)cost(-|$)']
  - id: telemetry
    label: 遥测
    weight: 1
    keywords: [telemetry, metrics]
    topics: [telemetry]
    namePatterns: [telemetry]
  - id: doubled
    label: 加权
    weight: 2
    keywords: [billing]
`;

test('classification assigns up to three labels with saturating confidence', () => {
  const book = new SegmentBook({ text: RULES });
  const labels = book.classify({ id: 'alice/dsh-plugin-cost-ledger', description: 'billing budget cost', topics: ['telemetry'] });
  assert.equal(labels.length, 3);
  assert.equal(labels[0]?.segment, 'cost');
  assert.equal(labels[1]?.segment, 'doubled', 'weight 2 lifts one keyword above a single topic');
  assert.equal(labels[2]?.segment, 'telemetry');
  assert.equal(labels[0]?.source, 'rules');
  assert.ok(labels[0]!.confidence > labels[1]!.confidence, '3 keywords + a name pattern beats one weighted keyword');
  assert.ok(labels.every((label) => label.confidence >= 0 && label.confidence < 1));
  assert.ok(Math.abs(labels[0]!.confidence - (1 - Math.exp(-5))) < 1e-9);
});

test('more evidence raises confidence but never reaches 1', () => {
  const book = new SegmentBook({ text: RULES });
  const one = book.primary({ id: 'a/x', description: 'cost', topics: [] });
  const many = book.primary({ id: 'a/x', description: 'cost budget billing', topics: ['billing'] });
  assert.equal(one.segment, 'cost');
  assert.ok(many.confidence > one.confidence);
  assert.ok(many.confidence < 1);
});

test('weights scale the score and therefore the confidence', () => {
  const book = new SegmentBook({ text: RULES });
  const straight = new SegmentBook({ text: RULES.replace('weight: 2', 'weight: 1') });
  const weighted = book.primary({ id: 'a/x', description: 'billing', topics: [] });
  const plain = straight.primary({ id: 'a/x', description: 'billing', topics: [] });
  assert.equal(weighted.segment, 'doubled');
  assert.ok(weighted.confidence > plain.confidence);
});

test('unmatched repos fall back to a zero-confidence other label', () => {
  const book = new SegmentBook({ text: RULES });
  assert.deepEqual(book.classify({ id: 'a/zzz', description: 'nothing relevant', topics: [] }), [
    { segment: 'other', confidence: 0, source: 'rules' },
  ]);
  assert.equal(book.primary({ id: 'a/zzz', description: '', topics: [] }).segment, 'other');
});

test('maxLabels caps multi-label output', () => {
  const book = new SegmentBook({ text: RULES, maxLabels: 1 });
  const labels = book.classify({ id: 'alice/dsh-plugin-cost-ledger', description: 'cost billing telemetry', topics: ['billing', 'telemetry'] });
  assert.equal(labels.length, 1);
  assert.equal(labels[0]?.segment, 'cost');
});

test('rules are skippable when malformed and edits hot-reload by size', () => {
  const path = join(work, 'rules-hot.yml');
  writeFileSync(path, RULES, 'utf8');
  const book = new SegmentBook({ filePath: path });
  assert.equal(book.ruleCount, 3);
  assert.equal(book.labels().get('cost'), '成本与预算');

  writeFileSync(
    path,
    `segments:
  - id: only
    keywords: [anything]
`,
    'utf8',
  );
  assert.equal(book.maybeReload(), true);
  assert.equal(book.ruleCount, 1);
  assert.equal(book.primary({ id: 'a/x', description: 'anything', topics: [] }).segment, 'only');

  writeFileSync(path, 'segments: [\n', 'utf8');
  assert.equal(book.maybeReload(), false, 'a broken edit must not take the scanner down');
  assert.equal(book.ruleCount, 1, 'last good rules survive');
});

test('overrides replace every rule label with one authoritative label', () => {
  const labels = [{ segment: 'cost', confidence: 0.9, source: 'rules' as const }];
  assert.deepEqual(applyOverride(labels, { segment: 'ui-client', reason: 'manual' }), [
    { segment: 'ui-client', confidence: 1, source: 'override' },
  ]);
  assert.equal(applyOverride(labels, null), labels);
});

test('the shipped default rules cover the known segments', () => {
  const book = new SegmentBook();
  assert.ok(book.ruleCount >= 8);
  assert.equal(book.primary({ id: 'alice/dsh-plugin-cost-ledger', description: 'budget and billing', topics: ['billing'] }).segment, 'cost-budget');
  assert.equal(book.primary({ id: 'alice/dsh-plugin-telemetry', description: 'dashboards', topics: ['telemetry'] }).segment, 'telemetry-analytics');
  assert.equal(book.primary({ id: 'alice/dsh-plugin-archive', description: 'export transcripts', topics: ['archive'] }).segment, 'archive-export');
});
