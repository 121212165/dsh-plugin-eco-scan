import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertSlugHits, indexForSlug, rowsForSlug, slugForIndex, tagIndexFrom } from '../data/tag-index.mjs';
import { validateTagIndex } from '../data/validate.mjs';

const D = JSON.parse(readFileSync(new URL('../data/eco-data.json', import.meta.url), 'utf8'));
const { meta, rows } = D;

test('meta.tagIndex maps every slug to its numeric row index', () => {
  assert.ok(meta.tagIndex, 'meta.tagIndex must exist');
  assert.deepEqual(meta.tagIndex, Object.fromEntries(meta.tags.map((t, i) => [t.id, i])));
  assert.equal(Object.keys(meta.tagIndex).length, 50);
  assert.equal(indexForSlug(meta, 'rag'), meta.tags.findIndex((t) => t.id === 'rag'));
  assert.equal(slugForIndex(meta, indexForSlug(meta, 'mcp')), 'mcp');
});

test('every slug crosswalks to at least one row (no silent empty slices)', () => {
  for (const slug of Object.keys(tagIndexFrom(meta))) {
    assert.ok(assertSlugHits(rows, meta, slug) >= 1, `slug ${slug} should hit >= 1 row`);
  }
  assert.ok(rowsForSlug(rows, meta, 'rag').length >= 1);
  assert.ok(rowsForSlug(rows, meta, 'mcp').length >= 1);
  const r = validateTagIndex(D);
  assert.equal(r.slugs, 50);
  assert.ok(r.minHits >= 1);
});

test('unknown slug throws instead of returning undefined', () => {
  assert.throws(() => indexForSlug(meta, 'definitely-not-a-tag'), /unknown tag slug/);
  assert.throws(() => assertSlugHits(rows, meta, 'nope'), /unknown tag slug/);
});
