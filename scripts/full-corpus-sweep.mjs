/** Full corpus sweep around GitHub's 1,000-results-per-search cap.
 * Plan: recursively split each base query by created date (and by star band /
 * pushed date when a single day still exceeds 1,000), then fetch each bucket.
 * Run: node full_sweep.mjs plan|fetch [--limit N]
 */
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  openDb,
  ecoPaths,
  ensureDefaultFiles,
  fetchCorpusGraphql,
  fetchCorpusRest,
  HttpClient,
  SegmentBook,
  applyOverride,
  upsertRepo,
  writeSnapshot,
  writeSnapshotSegments,
  replaceSegments,
  overrides,
  setMetaValue,
  startScan,
  finishScan,
} from '../lib/core/index.js';

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || execSync('gh auth token', { encoding: 'utf8' }).trim();
const TODAY = new Date().toISOString().slice(0, 10);
const DATA_DIR = process.env.ECO_SCAN_DATA_DIR || join(homedir(), '.dsh', 'eco-scan');
const PLAN_FILE = process.env.ECO_PLAN_FILE || join(DATA_DIR, 'full-plan.json');
const PROGRESS_FILE = process.env.ECO_PROGRESS_FILE || join(DATA_DIR, 'full-progress.jsonl');

const BASE_QUERIES = [
  'topic:dsh-plugin',
  'topic:dsh-plugins',
  'dsh-plugin in:name',
  'dsh-plugins in:name',
  'dsh-plugin in:description',
  'dsh-plugins in:description',
  'cordis plugin in:description',
  'deepseek-harness dsh-plugin in:description',
];

const MIN_DATE = '2005-01-01';
const STAR_BANDS = [
  [0, 0], [1, 2], [3, 5], [6, 10], [11, 20], [21, 50], [51, 100],
  [101, 200], [201, 500], [501, 1000], [1001, 2000], [2001, 5000],
  [5001, 10000], [10001, null],
];
const PAGE = 100;
const CONCURRENCY = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.error(...args);

async function graphql(query, variables, attempt = 0) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'eco-full-sweep' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 502 || res.status === 503 || res.status === 429 || res.status === 403) {
    if (attempt >= 6) throw new Error(`GraphQL HTTP ${res.status} after retries`);
    const wait = Math.min(60000, 3000 * 2 ** attempt);
    log(`  retry HTTP ${res.status}, wait ${wait}ms`);
    await sleep(wait);
    return graphql(query, variables, attempt + 1);
  }
  const body = await res.json();
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  if (body.errors && !body.data) throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
  return body.data;
}

async function count(q) {
  const data = await graphql(
    'query($q:String!){search(query:$q,type:REPOSITORY,first:1){repositoryCount}}',
    { q },
  );
  return Number(data.search?.repositoryCount ?? 0);
}

const LIGHT_SEARCH = `
query($q:String!,$first:Int!,$after:String){
  search(query:$q,type:REPOSITORY,first:$first,after:$after){
    repositoryCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on Repository {
      id nameWithOwner description stargazerCount forkCount
      primaryLanguage { name }
      repositoryTopics(first:20){ nodes { topic { name } } }
      createdAt pushedAt isArchived
    } }
  }
}`;

const normalize = (full) => {
  const [owner = '', name = ''] = String(full).trim().split('/');
  return `${owner.toLowerCase()}/${name.toLowerCase()}`;
};

async function fetchBucketGraphql(bucket) {
  const repos = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const data = await graphql(LIGHT_SEARCH, { q: bucket.query, first: 100, after });
    const search = data.search;
    if (!search?.nodes) break;
    for (const node of search.nodes) {
      if (!node?.nameWithOwner) continue;
      const topics = (node.repositoryTopics?.nodes ?? []).map((n) => n?.topic?.name).filter(Boolean);
      repos.push({
        id: normalize(node.nameWithOwner),
        description: node.description ?? '',
        stars: Number(node.stargazerCount ?? 0),
        forks: Number(node.forkCount ?? 0),
        openIssues: 0,
        language: node.primaryLanguage?.name ?? null,
        license: null,
        topics,
        createdAt: node.createdAt ?? '',
        pushedAt: node.pushedAt ?? '',
        lastCommitAt: null,
        contributors: null,
        ci: null,
        testsCount: null,
        issueCloseHours: null,
        archived: node.isArchived === true,
        nodeId: node.id ?? undefined,
      });
    }
    if (!search.pageInfo?.hasNextPage || !search.pageInfo?.endCursor) break;
    after = search.pageInfo.endCursor;
  }
  return { repos, complete: true };
}

const day = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const ms = (date) => Date.parse(`${date}T00:00:00Z`);

function bands(q, start, end) {
  return STAR_BANDS.map(([lo, hi]) => ({
    q: `${q} stars:${hi === null ? `>=${lo}` : `${lo}..${hi}`}`,
    lo,
    hi,
  }));
}

async function planRange(base, start, end, depth = 0, out = []) {
  if (ms(start) > ms(end)) return out;
  const q = `${base} created:${start}..${end}`;
  const total = await count(q);
  if (total === 0) return out;
  if (total <= 1000) {
    out.push({ query: q, count: total, base, start, end });
    if (out.length % 20 === 0) log(`  plan ${out.length} buckets, latest ${total}`);
    return out;
  }
  if (start === end) {
    // A single creation day over 1,000: split by star band, then by pushed date.
    for (const band of bands(q, start, end)) {
      const c = await count(band.q);
      if (c === 0) continue;
      if (c <= 1000) {
        out.push({ query: band.q, count: c, base, start, end, stars: `${band.lo}..${band.hi ?? '*'}` });
        continue;
      }
      log(`  dense single-day band ${c}: ${band.q}`);
      const pushed = await planPushed(band.q, '2005-01-01', TODAY);
      out.push(...pushed);
    }
    return out;
  }
  const mid = iso(ms(start) + Math.floor((ms(end) - ms(start)) / day / 2) * day);
  log(`  split ${start}..${end} (${total}) at ${mid}`);
  await planRange(base, start, mid, depth + 1, out);
  const next = iso(ms(mid) + day);
  await planRange(base, next, end, depth + 1, out);
  return out;
}

async function planPushed(q, start, end) {
  if (ms(start) > ms(end)) return [];
  const qq = `${q} pushed:${start}..${end}`;
  const c = await count(qq);
  if (c === 0) return [];
  if (c <= 1000) return [{ query: qq, count: c, base: 'pushed', start, end }];
  if (start === end) {
    log(`  UNSPLITTABLE ${c}: ${qq}`);
    return [{ query: qq, count: c, base: 'pushed', start, end, over: true }];
  }
  const mid = iso(ms(start) + Math.floor((ms(end) - ms(start)) / day / 2) * day);
  return [...(await planPushed(q, start, mid)), ...(await planPushed(q, iso(ms(mid) + day), end))];
}

async function runPlan() {
  const plan = [];
  for (const base of BASE_QUERIES) {
    const total = await count(base);
    log(`PLAN ${base} total=${total}`);
    const buckets = await planRange(base, MIN_DATE, TODAY);
    log(`PLAN ${base} buckets=${buckets.length} sum=${buckets.reduce((a, b) => a + b.count, 0)}`);
    plan.push(...buckets);
  }
  const sum = plan.reduce((a, b) => a + b.count, 0);
  writeFileSync(PLAN_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), today: TODAY, queries: BASE_QUERIES, buckets: plan, bucketCount: plan.length, sumCounts: sum }, null, 2));
  log(`PLAN done buckets=${plan.length} sum=${sum} -> ${PLAN_FILE}`);
}

async function runFetch(limit) {
  const plan = JSON.parse(readFileSync(PLAN_FILE, 'utf8'));
  let buckets = plan.buckets;
  if (limit) buckets = buckets.slice(0, limit);

  const byId = new Map();
  const doneQueries = new Set();
  if (existsSync(PROGRESS_FILE)) {
    for (const line of readFileSync(PROGRESS_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        doneQueries.add(item.query);
        for (const repo of item.repos) byId.set(repo.id, repo);
      } catch {}
    }
  }
  const todo = buckets.filter((bucket) => !doneQueries.has(bucket.query));
  log(`FETCH resume: done=${doneQueries.size} unique=${byId.size}; todo=${todo.length}/${plan.buckets.length}`);

  const http = new HttpClient({ token: TOKEN });
  let done = 0;
  const failures = [];
  let writeChain = Promise.resolve();
  const append = (item) => {
    writeChain = writeChain.then(() => appendFileSync(PROGRESS_FILE, `${JSON.stringify(item)}\n`));
    return writeChain;
  };

  async function fetchBucket(bucket) {
    // GraphQL first; REST after two failures (the 502s come and go).
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        if (attempt < 2) {
          const result = await fetchBucketGraphql(bucket);
          return { result, via: 'graphql' };
        }
        const result = await fetchCorpusRest(http, {
          token: TOKEN, queries: [bucket.query], maxPagesPerQuery: 10,
          maxRepos: 1000, restPacingMs: 2200, log: () => {},
        });
        return { result, via: 'rest' };
      } catch (error) {
        const wait = Math.min(90000, 5000 * 2 ** attempt);
        log(`  bucket error ${attempt + 1}/6 (${String(error).split('\n')[0].slice(0, 100)}), wait ${wait}ms`);
        await sleep(wait);
      }
    }
    return null;
  }

  async function worker() {
    while (true) {
      const bucket = todo.shift();
      if (!bucket) return;
      const out = await fetchBucket(bucket);
      if (out) {
        for (const repo of out.result.repos) byId.set(repo.id, repo);
        if (!out.result.complete) failures.push({ query: bucket.query, reason: 'partial', via: out.via });
        await append({ query: bucket.query, via: out.via, repos: out.result.repos });
      } else {
        failures.push({ query: bucket.query, reason: 'fetch failed' });
      }
      done++;
      log(`FETCH ${done}/${todo.length + done} (${doneQueries.size + done}/${plan.buckets.length}) unique=${byId.size} failures=${failures.length} last=${out?.via ?? 'FAIL'} ${bucket.query.slice(-40)}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await writeChain;
  log(`FETCH collected unique=${byId.size} failures=${failures.length}`);

  const now = new Date().toISOString();
  const db = openDb(`${DATA_DIR}/eco.db`);
  const paths = ecoPaths(DATA_DIR);
  ensureDefaultFiles(paths);
  const scanId = startScan(db, TODAY, now);

  for (const repo of byId.values()) upsertRepo(db, repo, now);

  const book = new SegmentBook({ filePath: paths.rulesPath });
  book.maybeReload();
  const overrideMap = overrides(db);
  const existing = new Map(
    db.raw.prepare('select repo_id, npm_weekly, release_downloads from snapshots where scan_date = ?').all(TODAY)
      .map((row) => [row.repo_id, row]),
  );
  let written = 0;
  for (const repo of byId.values()) {
    const prior = existing.get(repo.id);
    const labels = applyOverride(
      book.classify({ id: repo.id, description: repo.description, topics: repo.topics }),
      overrideMap.get(repo.id) ?? null,
    );
    const primary = labels[0] ?? { segment: 'other', confidence: 0, source: 'rules' };
    writeSnapshot(db, {
      repoId: repo.id,
      date: TODAY,
      stars: repo.stars,
      npmWeekly: prior?.npm_weekly ?? null,
      releaseDownloads: prior?.release_downloads ?? null,
      segment: primary.segment,
      segmentConfidence: primary.confidence,
    }, now);
    writeSnapshotSegments(db, repo.id, TODAY, labels);
    replaceSegments(db, repo.id, labels, now);
    written++;
  }

  const complete = failures.length === 0;
  setMetaValue(db, 'corpus-complete', complete ? '1' : '0');
  setMetaValue(db, 'corpus-sweep', JSON.stringify({
    at: now, buckets: plan.buckets.length, fetched: done, unique: byId.size,
    failures: failures.slice(0, 50), expected: plan.sumCounts, queries: plan.queries,
  }));
  const repoCount = db.raw.prepare('select count(*) n from repos').get().n;
  const snapCount = db.raw.prepare('select count(*) n from snapshots where scan_date = ?').get(TODAY).n;
  finishScan(db, scanId, complete ? 'ok' : 'partial', snapCount, 0, complete ? null : `${failures.length} buckets incomplete`);
  db.close();
  log(`FETCH done written=${written} repoTotal=${repoCount} snapshotsToday=${snapCount} complete=${complete}`);
}

const mode = process.argv[2] ?? 'plan';
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 0;
if (mode === 'plan') await runPlan();
else if (mode === 'fetch') await runFetch(limit);
else { console.error('usage: node full_sweep.mjs plan|fetch [--limit N]'); process.exit(2); }
