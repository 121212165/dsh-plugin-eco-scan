// Expand repo -> npm package mappings with the free registry search index, then
// fill weekly downloads for the latest snapshot. Run after the corpus sweep.
//   node --experimental-sqlite npm_map_expand.mjs            # dry run, no writes
//   node --experimental-sqlite npm_map_expand.mjs --write    # apply
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(process.env.USERPROFILE || process.env.HOME, '.dsh', 'eco-scan');
const DB_PATH = join(DATA_DIR, 'eco.db');
const WRITE = process.argv.includes('--write');
// Heuristic stem matches are noisier than package.links.repository matches; keep
// them opt-in until a precision sample passes.
const INCLUDE_HEURISTIC = process.env.NPM_HEURISTIC === '1';
const PAGE = 250;
// Per-query caps: keyword queries are dense in real plugins; plain-text queries
// mostly add names for the heuristic index.
const QUERIES = [
  ['keywords:dsh-plugin', 10000],
  ['keywords:deepseek-harness', 5000],
  ['dsh-plugin', 5000],
  ['deepseek-harness', 5000],
  ['dsh', 4000],
];
const PREFIXES = ['dsh-plugin-', 'dsh-', 'deepseek-harness-', 'deepseek-'];

const db = new DatabaseSync(DB_PATH, { readOnly: !WRITE });
const DATE = process.env.ECO_SNAPSHOT_DATE || db.prepare('SELECT MAX(scan_date) AS d FROM snapshots').get().d;
console.log('snapshot date', DATE, WRITE ? '(write)' : '(dry run)');

const cachePath = join(here, 'npm-search-cache.json');
let cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

async function fetchPage(text, from) {
  const key = text + '#' + from;
  if (cache[key]) return cache[key];
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=${PAGE}&from=${from}`;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'dsh-eco-report' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const objects = (j.objects || []).map((o) => ({
        name: o.package?.name,
        weekly: o.package?.downloads?.weekly ?? null,
        repo: o.package?.links?.repository || o.package?.npm?.repository || null,
        keywords: o.package?.keywords || [],
      }));
      cache[key] = objects;
      return objects;
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); }
  }
  console.log('search failed', text, from, String(lastErr));
  return [];
}

const index = new Map();
for (const [text, cap] of QUERIES) {
  let got = 0, empty = 0;
  for (let from = 0; from < cap; from += PAGE) {
    const objects = await fetchPage(text, from);
    if (!objects.length) { empty++; if (empty >= 1) break; }
    for (const o of objects) if (o.name && !index.has(o.name)) index.set(o.name, o);
    got += objects.length;
    if (objects.length < PAGE) break;
  }
  writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
  console.log(`search ${text}: ${got} rows, index ${index.size}`);
}

function parseGithub(url) {
  if (!url) return null;
  const m = String(url).replace(/^git\+/, '').match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
  if (!m) return null;
  return (m[1] + '/' + m[2]).replace(/\.git$/i, '').toLowerCase();
}
function stem(s) {
  let t = String(s).toLowerCase();
  for (const p of PREFIXES) if (t.startsWith(p) && t.length > p.length + 2) return t.slice(p.length);
  return t;
}
const pkgStem = (name) => stem(String(name).replace(/^@[^/]+\//, ''));

const repoIds = new Map(db.prepare('SELECT id FROM repos').all().map((r) => [r.id.toLowerCase(), r.id]));
const existing = new Map();
for (const m of db.prepare('SELECT repo_id AS id, npm_name AS n, confidence AS c FROM repo_npm_map').all()) {
  if (!existing.has(m.id)) existing.set(m.id, []);
  existing.get(m.id).push(m);
}
const mappedRepos = new Set(existing.keys());

// Registry link matches are authoritative.
const candidates = new Map(); // repoId -> {npmName, confidence, source}
let linkHits = 0;
for (const [name, pkg] of index) {
  const id = parseGithub(pkg.repo);
  if (!id) continue;
  const real = repoIds.get(id);
  if (!real || mappedRepos.has(real)) continue;
  linkHits++;
  const cur = candidates.get(real);
  const conf = 1;
  if (!cur || conf > cur.confidence || (conf === cur.confidence && (pkg.weekly || 0) > (cur.weekly || 0)))
    candidates.set(real, { npmName: name, confidence: conf, source: 'registry', weekly: pkg.weekly || 0 });
}
console.log('registry-link matches', linkHits);

// Heuristic: normalized repo stem equals normalized package stem. Skip when a
// stem is claimed by multiple packages/repos to avoid double counting.
const byStem = new Map();
for (const [name] of index) {
  const s = pkgStem(name);
  if (s.length < 4) continue;
  if (!byStem.has(s)) byStem.set(s, []);
  byStem.get(s).push(name);
}
let heuristicHits = 0;
if (INCLUDE_HEURISTIC) {
  for (const [idLower, real] of repoIds) {
    if (mappedRepos.has(real) || candidates.has(real)) continue;
    const s = stem(idLower.split('/')[1] || '');
    if (s.length < 4) continue;
    const names = byStem.get(s) || [];
    if (names.length !== 1) continue;
    heuristicHits++;
    const pkg = index.get(names[0]);
    candidates.set(real, { npmName: names[0], confidence: 0.85, source: 'heuristic', weekly: pkg?.weekly || 0 });
  }
}
console.log('heuristic matches', heuristicHits, INCLUDE_HEURISTIC ? '' : '(disabled; NPM_HEURISTIC=1 to enable)', 'total new candidates', candidates.size);

if (!WRITE) {
  const before = db.prepare('SELECT COUNT(*) n FROM snapshots WHERE scan_date=? AND npm_weekly>0').get(DATE).n;
  const total = db.prepare('SELECT COUNT(*) n FROM snapshots WHERE scan_date=?').get(DATE).n;
  console.log(`weekly-positive ${before}/${total} (${(before / total * 100).toFixed(2)}%)`);
  console.log('projected new mapped repos', candidates.size, 'projected weekly-positive', before + candidates.size);
  process.exit(0);
}

// Download stats for packages we did not already have.
const knownNames = new Set(db.prepare('SELECT name FROM npm_packages').all().map((r) => r.name));
const need = [...new Set([...candidates.values()].map((c) => c.npmName))].filter((n) => !knownNames.has(n));
console.log('packages needing stats', need.length);
const { HttpClient, fetchDownloadStats } = await import(pathToFileURL('C:/Users/lenovo/.zcode/workspace/default/dsh-plugin-eco-scan/lib/core/index.js').href);
const http = new HttpClient({ userAgent: 'dsh-eco-report' });
const knownWeekly = new Map([...index].filter(([, p]) => p.weekly != null).map(([n, p]) => [n, p.weekly]));
const stats = await fetchDownloadStats(http, need, { knownWeekly, concurrency: 4, bulkConcurrency: 3, scopedBudget: 300 });
console.log('stats fetched', stats.size, 'of', need.length);

const nowIso = new Date().toISOString();
const insPkg = db.prepare(`INSERT INTO npm_packages(name, weekly_downloads, range_week, range_prev, growth_pct, fetched_at)
  VALUES(?,?,?,?,?,?)
  ON CONFLICT(name) DO UPDATE SET weekly_downloads=excluded.weekly_downloads, range_week=excluded.range_week,
    range_prev=excluded.range_prev, growth_pct=excluded.growth_pct, fetched_at=excluded.fetched_at`);
const insMap = db.prepare(`INSERT INTO repo_npm_map(repo_id, npm_name, confidence, source, updated_at)
  VALUES(?,?,?,?,?)
  ON CONFLICT(repo_id, npm_name) DO UPDATE SET confidence=MAX(confidence, excluded.confidence),
    source=excluded.source, updated_at=excluded.updated_at`);
let pkgWrites = 0, mapWrites = 0;
for (const s of stats.values()) {
  insPkg.run(s.name, s.weekly ?? 0, s.weekly ?? null, s.prev ?? null, s.growthPct ?? null, s.fetchedAt ?? nowIso);
  pkgWrites++;
}
for (const [repoId, c] of candidates) {
  if (!stats.has(c.npmName) && !knownNames.has(c.npmName)) continue;
  insMap.run(repoId, c.npmName, c.confidence, c.source, nowIso);
  mapWrites++;
}
console.log('wrote packages', pkgWrites, 'mappings', mapWrites);

// Recompute weekly per repo from all mappings and stamp the latest snapshot.
const weeklyByRepo = new Map();
for (const r of db.prepare(`SELECT m.repo_id AS id, p.weekly_downloads AS w FROM repo_npm_map m
  JOIN npm_packages p ON p.name=m.npm_name WHERE m.confidence>=0.85`).all()) {
  weeklyByRepo.set(r.id, (weeklyByRepo.get(r.id) || 0) + (r.w || 0));
}
const upd = db.prepare('UPDATE snapshots SET npm_weekly=? WHERE repo_id=? AND scan_date=?');
let snapWrites = 0;
for (const [repoId, w] of weeklyByRepo) { upd.run(w, repoId, DATE); snapWrites++; }
console.log('snapshot weekly rows', snapWrites);

const after = db.prepare('SELECT COUNT(*) n FROM snapshots WHERE scan_date=? AND npm_weekly>0').get(DATE).n;
const total = db.prepare('SELECT COUNT(*) n FROM snapshots WHERE scan_date=?').get(DATE).n;
const main = db.prepare('SELECT COUNT(*) n FROM snapshots WHERE scan_date=? AND stars>0 AND npm_weekly>0').get(DATE).n;
const mainTotal = db.prepare('SELECT COUNT(*) n FROM snapshots WHERE scan_date=? AND stars>0').get(DATE).n;
const report = {
  date: DATE, indexedPackages: index.size, registryLinkMatches: linkHits, heuristicMatches: heuristicHits,
  newMappings: mapWrites, packagesWithStats: stats.size,
  weeklyPositive: { before: null, after, total, coveragePct: +(after / total * 100).toFixed(2) },
  mainScope: { weeklyPositive: main, total: mainTotal, coveragePct: +(main / mainTotal * 100).toFixed(2) },
};
writeFileSync(join(here, 'npm-map-expand-report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
