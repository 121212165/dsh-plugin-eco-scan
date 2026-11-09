// Offline re-tag of generic-only repos with context-gated enrichment (no network; README cache).
// Run: node --experimental-sqlite retag_enrichment.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichCapabilities, GENERIC } from './signal_tags.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ECO_DATA_DIR || join(process.env.USERPROFILE || process.env.HOME, '.dsh', 'eco-scan');

const generic = JSON.parse(readFileSync(join(here, 'generic-repos.json'), 'utf8'));
const cache = JSON.parse(readFileSync(join(here, 'pilot-readme-cache.json'), 'utf8'));
const npmCache = JSON.parse(readFileSync(join(here, 'npm-keywords-cache.json'), 'utf8'));
const db = new DatabaseSync(join(DATA_DIR, 'eco.db'), { readOnly: true });
const npmMap = new Map();
for (const m of db.prepare(`SELECT repo_id AS id, npm_name AS n FROM repo_npm_map WHERE confidence >= 0.85`).all())
  if (!npmMap.has(m.id)) npmMap.set(m.id, m.n);

const outPath = join(here, 'enrichment-candidates.json');
if (existsSync(outPath) && !existsSync(join(here, 'enrichment-candidates.v1.json')))
  copyFileSync(outPath, join(here, 'enrichment-candidates.v1.json'));

const results = [];
let hit = 0, noReadme = 0;
const tagFreq = {};
for (const g of generic) {
  const readme = cache[g.id] || '';
  if (!readme) noReadme++;
  const npmName = npmMap.get(g.id);
  const kw = npmName ? (npmCache[npmName] || []) : [];
  const caps = enrichCapabilities(readme, kw);
  const gained = caps.filter((t) => !g.tags.includes(t) && !GENERIC.has(t));
  if (gained.length) { hit++; for (const t of gained) tagFreq[t] = (tagFreq[t] || 0) + 1; }
  results.push({ id: g.id, rank: g.rank, before: g.tags, gained });
}
writeFileSync(outPath, JSON.stringify({ done: generic.length, hit, noReadme, stopped: false, fetched: 0, method: 'context-gated-v6', results }, null, 1), 'utf8');
console.log(`retagged ${generic.length} gained=${hit} (${(hit / generic.length * 100).toFixed(0)}%) noReadme=${noReadme}`);
console.log('top gained tags:', Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => `${t}:${n}`).join(' '));