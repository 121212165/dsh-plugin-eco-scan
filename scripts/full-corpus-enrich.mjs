/** Non-destructive npm enrichment for the full corpus.
 * The library's npm stage rebuilds every mapping with an O(repos x packages)
 * heuristic loop, which does not scale past ~30k repos. This version indexes
 * package stems first, only scores plausible candidates, keeps existing
 * mappings, and then refreshes download stats + today's snapshots. */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  openDb,
  ecoPaths,
  HttpClient,
  searchPackages,
  fetchDownloadStats,
  registryMappings,
  parseManualMapping,
  parseAwesomeReadme,
  normalizePackageStem,
  normalizeRepoStem,
  heuristicConfidence,
  allRepos,
  allMappings,
  putMapping,
  upsertNpmPackage,
  writeSnapshot,
  setMetaValue,
} from '../lib/core/index.js';

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || execSync('gh auth token', { encoding: 'utf8' }).trim();
const DATA_DIR = process.env.ECO_SCAN_DATA_DIR || join(homedir(), '.dsh', 'eco-scan');
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const log = (m) => console.log(m);

const db = openDb(`${DATA_DIR}/eco.db`);
const paths = ecoPaths(DATA_DIR);
const http = new HttpClient({ token: TOKEN });

const repos = allRepos(db);
const repoSet = new Set(repos.map((r) => r.id));
log(`repos in db: ${repos.length}`);

const search = await searchPackages(http, { maxPages: 8, maxPackages: 2000, log });
log(`npm packages: ${search.packages.length} (errors ${search.errors.length})`);
const knownWeekly = new Map();
for (const pkg of search.packages) if (pkg.weekly !== null) knownWeekly.set(pkg.name, pkg.weekly);

const manual = existsSync(paths.mappingPath) ? parseManualMapping(readFileSync(paths.mappingPath, 'utf8')) : [];
const awesome = existsSync(paths.awesomePath ?? '') ? parseAwesomeReadme(readFileSync(paths.awesomePath, 'utf8')) : [];
const authoritative = [...manual, ...awesome, ...registryMappings(search.packages)].filter((p) => repoSet.has(p.repoId));

const byRepo = new Map();
const add = (pair) => {
  const list = byRepo.get(pair.repoId) ?? [];
  if (!list.some((row) => row.npmName === pair.npmName)) {
    list.push(pair);
    byRepo.set(pair.repoId, list);
  }
};
for (const pair of authoritative) add(pair);
log(`authoritative pairs: ${byRepo.size} repos covered`);

// Inverted indexes so the heuristic only scores a handful of candidates per repo.
const exact = new Map();
const prefix = new Map();
const tokens = new Map();
for (const pkg of search.packages) {
  const stem = normalizePackageStem(pkg.name);
  if (!stem) continue;
  (exact.get(stem) ?? exact.set(stem, []).get(stem)).push(pkg.name);
  const p4 = stem.slice(0, 4);
  if (p4.length >= 4) (prefix.get(p4) ?? prefix.set(p4, []).get(p4)).push(pkg.name);
  for (const token of stem.split('-')) {
    if (token.length < 3) continue;
    (tokens.get(token) ?? tokens.set(token, []).get(token)).push(pkg.name);
  }
}

let heuristicAdded = 0;
let ambiguous = 0;
for (const repo of repos) {
  if (byRepo.has(repo.id)) continue;
  const stem = normalizeRepoStem(repo.id);
  if (!stem) continue;
  const candidates = new Set([
    ...(exact.get(stem) ?? []),
    ...(prefix.get(stem.slice(0, 4)) ?? []),
    ...(prefix.get(stem.slice(0, 6)) ?? []),
  ]);
  for (const token of stem.split('-')) {
    const list = tokens.get(token) ?? [];
    for (const name of list.slice(0, 40)) candidates.add(name);
  }
  const scored = [...candidates]
    .map((name) => ({ npmName: name, confidence: heuristicConfidence(repo.id, name) }))
    .filter((c) => c.confidence >= 0.85)
    .sort((a, b) => b.confidence - a.confidence || a.npmName.localeCompare(b.npmName));
  const best = scored[0];
  if (!best) continue;
  if (scored.filter((c) => c.confidence === best.confidence).length > 1) ambiguous++;
  add({ repoId: repo.id, npmName: best.npmName, confidence: best.confidence, source: 'heuristic' });
  heuristicAdded++;
  if ((heuristicAdded % 2000) === 0) log(`heuristic mapped ${heuristicAdded}`);
}
log(`heuristic pairs added: ${heuristicAdded}, ambiguous: ${ambiguous}`);

const existing = allMappings(db);
const existingKeys = new Set(existing.map((m) => `${m.repoId}\u0000${m.npmName}`));
const nowIso = NOW.toISOString();
let inserted = 0;
for (const list of byRepo.values()) {
  for (const pair of list) {
    const key = `${pair.repoId}\u0000${pair.npmName}`;
    if (existingKeys.has(key)) continue;
    putMapping(db, { repoId: pair.repoId, npmName: pair.npmName, confidence: pair.confidence, source: pair.source, updatedAt: nowIso }, nowIso);
    existingKeys.add(key);
    inserted++;
  }
}
log(`mappings inserted: ${inserted} (total now ${allMappings(db).length})`);

const names = [...new Set(allMappings(db).map((m) => m.npmName))];
log(`packages to refresh: ${names.length}`);
const downloads = await fetchDownloadStats(http, names, {
  now: NOW,
  knownWeekly,
  scopedBudget: 900,
  bulkConcurrency: 2,
  concurrency: 3,
  log,
});
log(`download stats: ${downloads.stats.size}/${names.length}, errors ${downloads.errors.length}`);
for (const stat of downloads.stats.values()) upsertNpmPackage(db, stat);

const npmByName = new Map(
  db.raw.prepare('select name, weekly_downloads from npm_packages').all().map((row) => [row.name, row.weekly_downloads]),
);
const weeklyByRepo = new Map();
for (const row of allMappings(db)) {
  const weekly = npmByName.get(row.npmName);
  if (weekly === undefined) continue;
  weeklyByRepo.set(row.repoId, (weeklyByRepo.get(row.repoId) ?? 0) + weekly);
}

const snaps = db.raw.prepare('select repo_id, stars, release_downloads, segment, segment_confidence from snapshots where scan_date = ?').all(TODAY);
let updated = 0;
for (const snap of snaps) {
  writeSnapshot(db, {
    repoId: snap.repo_id,
    date: TODAY,
    stars: snap.stars,
    npmWeekly: weeklyByRepo.get(snap.repo_id) ?? null,
    releaseDownloads: snap.release_downloads,
    segment: snap.segment,
    segmentConfidence: snap.segment_confidence,
  }, nowIso);
  updated++;
  if (updated % 5000 === 0) log(`snapshots updated ${updated}/${snaps.length}`);
}
log(`snapshots updated ${updated}/${snaps.length}`);

const mappedRepos = db.raw.prepare('select count(distinct repo_id) n from repo_npm_map').get().n;
const withWeekly = db.raw.prepare('select count(*) n from snapshots where scan_date=? and npm_weekly is not null').get(TODAY).n;
const verifiedRepos = db.raw.prepare('select count(distinct repo_id) n from repo_npm_map where confidence=1').get().n;
setMetaValue(db, 'mapping-ambiguous', String(ambiguous));
setMetaValue(db, 'npm-enriched-at', nowIso);
log(`SUMMARY repos=${repos.length} mappedRepos=${mappedRepos} verifiedRepos=${verifiedRepos} withWeekly=${withWeekly} packages=${npmByName.size}`);
db.close();
