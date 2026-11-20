/** Two tag id systems coexist in eco-data.json — source of truth: DATA-DICTIONARY.md.
 *  - `meta.tags[i].id` is a SLUG ("rag", "mcp", "finance", ...)
 *  - `rows[].tags` stores NUMERIC indexes into `meta.tags` (8, 13, 47, ...)
 * `meta.tagIndex` is the canonical slug -> index crosswalk. Use these helpers
 * instead of hand-written id arithmetic so a slug lookup can never be silent. */

/** @param {{ tags: {id:string}[], tagIndex?: Record<string,number> }} meta */
export function tagIndexFrom(meta) {
  if (meta.tagIndex && typeof meta.tagIndex === 'object') return meta.tagIndex;
  // compatibility with any snapshot that predates meta.tagIndex
  return Object.fromEntries(meta.tags.map((t, i) => [t.id, i]));
}

export function indexForSlug(meta, slug) {
  const idx = tagIndexFrom(meta)[slug];
  if (idx === undefined) throw new Error(`unknown tag slug: ${slug}`);
  return idx;
}

export function slugForIndex(meta, index) {
  const slug = meta.tags[index]?.id;
  if (slug === undefined) throw new Error(`unknown tag index: ${index}`);
  return slug;
}

/** @param {any[]} rows */
export function rowsForSlug(rows, meta, slug) {
  const idx = indexForSlug(meta, slug);
  return rows.filter((r) => (r[9] || []).includes(idx));
}

/** Slug conversion must resolve to at least one row — otherwise throw loudly
 * instead of silently producing an empty domain slice (issue #13). */
export function assertSlugHits(rows, meta, slug) {
  const hits = rowsForSlug(rows, meta, slug).length;
  if (hits < 1) throw new Error(`tag slug "${slug}" (index ${indexForSlug(meta, slug)}) matches 0 rows`);
  return hits;
}
