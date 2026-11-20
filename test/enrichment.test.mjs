import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const D = JSON.parse(read('../data/eco-data.json'));
const { rows, meta } = D;

test('every row carries the 4 enrichment fields (14 -> 18 columns)', () => {
  assert.equal(rows.length, 38549);
  for (const r of rows) assert.equal(r.length, 18);
});

test('owner is derived from id; license/latest_version are explicitly unknown', () => {
  for (const r of rows) {
    assert.equal(r[17], String(r[0]).split('/')[0]);
    assert.equal(r[15], null, 'license must be null when source does not provide it');
    assert.equal(r[16], null, 'latest_version must be null when source does not provide it');
  }
});

test('exactly the 174 enriched rows get a visible tag + summary description', () => {
  const enriched = rows.filter((r) => r[10] === 1);
  const plain = rows.filter((r) => r[10] !== 1);
  assert.equal(enriched.length, 174);
  for (const r of enriched) {
    assert.equal(typeof r[14], 'string');
    assert.ok(r[14].length > 10, `description too short for ${r[0]}`);
    assert.match(r[14], /能力标签/);
  }
  for (const r of plain) assert.equal(r[14], null);
  // summary must be built from real tag names, not the repo name
  const sample = enriched[0];
  const tagNames = sample[9].map((i) => meta.tags[i]?.name).filter(Boolean);
  for (const name of tagNames) assert.ok(sample[14].includes(name), `summary should include real tag ${name}`);
});

test('digest renders an ENRICHED SAMPLES section with labels and summaries', () => {
  const digest = read('../data/digest.md');
  assert.match(digest, /## ENRICHED SAMPLES \(row\[10\]=1, label \+ summary\)/);
  const section = digest.split('## ENRICHED SAMPLES')[1].split('\n## ')[0];
  assert.match(section, /标签：/);
  assert.match(section, /摘要：/);
  assert.match(section, /owner：/);
  assert.ok(!section.includes('(no summary available in this snapshot)'), 'all 174 enriched rows now have summaries');
});
