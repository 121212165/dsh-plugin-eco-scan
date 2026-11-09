// Batch-fill capability-tag candidates for all generic-only repos from cleaned README head + npm keywords.
// Zero cost, resumable (cache), quota-guarded. Produces enrichment-candidates.json ONLY; no DB/ranking change.
// Run: node --experimental-sqlite batch_signal.mjs [concurrency]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const CONC = parseInt(process.argv[2] || '6', 10);
const pexec = promisify(exec);
const DATA_DIR = process.env.ECO_DATA_DIR || join(process.env.USERPROFILE || process.env.HOME, '.dsh', 'eco-scan');

import { TOPIC_STOP, TAX, MISC } from './taxonomy.mjs';
const GENERIC = new Set(['agent','session','skill','workspace','llm','misc','cli','code','file','doc','awesome']);
function parseTopics(raw) { if (!raw) return []; try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; } }
function tagIds(name, desc, topics) {
  const clean = topics.filter((t) => !TOPIC_STOP.has(String(t).toLowerCase()));
  const text = (name + ' ' + (desc || '') + ' ' + clean.join(' ')).toLowerCase();
  const out = [];
  for (const t of TAX) if (t[3].test(text)) out.push(t[0]);
  return out.length ? out.slice(0, 4) : ['misc'];
}
function cleanReadme(raw) {
  let t = raw;
  t = t.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ')
       .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
       .replace(/https?:\/\/\S+/g, ' ').replace(/[|]/g, ' ').replace(/\s+/g, ' ');
  return t.slice(0, 1200);
}

const db = new DatabaseSync(join(DATA_DIR, 'eco.db'), { readOnly: true });
const npmMap = new Map();
for (const m of db.prepare(`SELECT repo_id AS id, npm_name AS n FROM repo_npm_map WHERE confidence >= 0.85`).all())
  if (!npmMap.has(m.id)) npmMap.set(m.id, m.n);
const metaStmt = db.prepare(`SELECT description AS d, topics AS t FROM repos WHERE id = ?`);

const generic = JSON.parse(readFileSync(join(here, 'generic-repos.json'), 'utf8'));
const cachePath = join(here, 'pilot-readme-cache.json');
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const npmCachePath = join(here, 'npm-keywords-cache.json');
const npmCache = existsSync(npmCachePath) ? JSON.parse(readFileSync(npmCachePath, 'utf8')) : {};

let budget = 1e9;
try {
  const rl = JSON.parse(await pexec('gh api rate_limit', { encoding: 'utf8' }).then((r) => r.stdout));
  budget = Math.max(0, rl.resources.core.remaining - 150);
} catch {}
console.log('quota budget for README fetches:', budget);

const results = [];
let fetched = 0, hit = 0, noReadme = 0, done = 0;
const queue = generic.slice();
let stopped = false;

async function fetchReadme(id) {
  try {
    const { stdout } = await pexec(`gh api repos/${id}/readme -H "Accept: application/vnd.github.raw"`, { encoding: 'utf8', timeout: 20000, maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch { return ''; }
}
async function fetchKw(name) {
  if (name in npmCache) return npmCache[name];
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(15000) });
    const j = await res.json();
    const kw = Array.isArray(j.keywords) ? j.keywords : [];
    npmCache[name] = kw; return kw;
  } catch { npmCache[name] = []; return []; }
}
async function worker() {
  while (queue.length && !stopped) {
    const g = queue.shift();
    let readme = cache[g.id];
    if (readme == null) {
      if (budget <= 0) { stopped = true; queue.unshift(g); break; }
      budget--; fetched++;
      readme = await fetchReadme(g.id);
      cache[g.id] = readme;
    }
    if (!readme) noReadme++;
    const meta = metaStmt.get(g.id) || {};
    const npmName = npmMap.get(g.id);
    const kw = npmName ? await fetchKw(npmName) : [];
    const after = tagIds(g.id, (meta.d || '') + ' ' + cleanReadme(readme), [...parseTopics(meta.t), ...kw]);
    const gained = after.filter((t) => !g.tags.includes(t) && !GENERIC.has(t));
    if (gained.length) hit++;
    results.push({ id: g.id, rank: g.rank, before: g.tags, gained });
    done++;
    if (done % 200 === 0) {
      writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
      writeFileSync(npmCachePath, JSON.stringify(npmCache), 'utf8');
      writeFileSync(join(here, 'enrichment-candidates.json'), JSON.stringify({ done, hit, noReadme, stopped, results }, null, 1), 'utf8');
      console.log(`progress ${done}/${generic.length} hit=${hit} fetched=${fetched} budget=${budget}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
writeFileSync(npmCachePath, JSON.stringify(npmCache), 'utf8');
writeFileSync(join(here, 'enrichment-candidates.json'), JSON.stringify({ done, hit, noReadme, stopped, fetched, results }, null, 1), 'utf8');
console.log(`DONE ${done}/${generic.length}  gained-capability=${hit} (${(hit / Math.max(1, done) * 100).toFixed(0)}%)  noReadme=${noReadme}  fetched=${fetched}  stoppedByQuota=${stopped}`);