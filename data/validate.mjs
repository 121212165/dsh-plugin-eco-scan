/** Data-contract validation CLI. Run: `node data/validate.mjs`.
 * Rules: every meta.tags slug must crosswalk via meta.tagIndex to >= 1 row. */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { assertSlugHits, indexForSlug, tagIndexFrom } from './tag-index.mjs';

export function validateColumns(D) {
  const cols = D.meta.columns;
  // 0..13 = core schema, 14..17 = enrichment fields (issue #17)
  if (!Array.isArray(cols) || cols.length !== 18) throw new Error('meta.columns must describe 18 columns (14 core + 4 enrichment)');
  cols.forEach((c, i) => {
    if (c.index !== i || typeof c.field !== 'string' || !c.field) throw new Error(`meta.columns[${i}] is malformed`);
  });
  return { columns: cols.length };
}

export function validateTagIndex(D) {
  const { meta, rows } = D;
  if (!meta.tagIndex) throw new Error('meta.tagIndex is missing');
  const idx = tagIndexFrom(meta);
  if (Object.keys(idx).length !== meta.tags.length) throw new Error('meta.tagIndex does not cover all meta.tags');
  let min = Infinity, minSlug = '';
  for (const slug of Object.keys(idx)) {
    const hits = assertSlugHits(rows, meta, slug);
    if (hits < min) { min = hits; minSlug = slug; }
  }
  return { slugs: Object.keys(idx).length, minHits: min, minSlug };
}

function main() {
  const D = JSON.parse(fs.readFileSync(new URL('./eco-data.json', import.meta.url), 'utf8'));
  const r = validateTagIndex(D);
  const c = validateColumns(D);
  console.log(`tagIndex OK: ${r.slugs} slugs, every slug hits >= 1 row (min ${r.minHits} @ ${r.minSlug})`);
  console.log(`columns OK: ${c.columns} columns (meta.columns covers row[0..17])`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
