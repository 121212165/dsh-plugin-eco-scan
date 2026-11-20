import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateColumns } from '../data/validate.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const D = JSON.parse(read('../data/eco-data.json'));

test('meta.columns covers 18 positional fields in order (14 core + 4 enrichment)', () => {
  assert.deepEqual(validateColumns(D), { columns: 18 });
  assert.deepEqual(D.meta.columns.map((c) => c.field), [
    'id', 'score', 'stars', 'weekly', 'growthRawPct', 'ageDays', 'segIdx',
    'activity', 'archived', 'tags', 'isEnriched', 'coverage', 'lowSignal', 'starVel',
    'description', 'license', 'latest_version', 'owner',
  ]);
});

test('DATA-DICTIONARY.md documents all 14 columns and the two tag id systems', () => {
  const md = read('../data/DATA-DICTIONARY.md');
  for (const c of D.meta.columns) {
    assert.ok(md.includes('`' + c.field + '`'), `dictionary should document ${c.field}`);
  }
  assert.match(md, /meta\.tagIndex/);
  assert.match(md, /数字下标/);
  assert.match(md, /不是 isMain/);
});

test('AGENT_BRIEF.md no longer hand-writes the row field mapping', () => {
  const brief = read('../data/AGENT_BRIEF.md');
  assert.match(brief, /DATA-DICTIONARY\.md/);
  assert.ok(!brief.includes('isMain, isEnriched, x, y'));
  assert.ok(!brief.includes('rows[] = [id, score, stars, weekly'));
});

test('digest.md prints the machine-readable column names table', () => {
  const digest = read('../data/digest.md');
  assert.match(digest, /## COLUMN NAMES \(see data\/DATA-DICTIONARY\.md\)/);
  assert.match(digest, /\[13\] `starVel`/);
});
