// Recomputed potential board (#22): young repos with a real star story or
// verified npm traction. Reads the latest snapshot pair; no DB writes.
// Run: node --experimental-sqlite potential-v4.mjs
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ECO_DATA_DIR || join(process.env.USERPROFILE || process.env.HOME, '.dsh', 'eco-scan');
const db = new DatabaseSync(join(DATA_DIR, 'eco.db'), { readOnly: true });
const TODAY = process.env.ECO_SNAPSHOT_DATE || db.prepare('SELECT MAX(scan_date) AS d FROM snapshots').get().d;
const PREV = db.prepare('SELECT scan_date AS d FROM snapshots WHERE scan_date < ? GROUP BY scan_date ORDER BY d DESC LIMIT 1').get(TODAY)?.d ?? null;
const now = Date.parse(`${TODAY}T23:59:59Z`);
const days = (iso) => (iso ? (now - Date.parse(iso)) / 86400000 : null);
const prevDays = PREV ? Math.max(1, (Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${PREV}T00:00:00Z`)) / 86400000) : null;

const repos = db.prepare(`select id, description, forks, open_issues, language, topics, created_at, pushed_at, last_commit_at, archived from repos`).all();
const snaps = new Map(db.prepare(`select repo_id, stars, npm_weekly, release_downloads from snapshots where scan_date=?`).all(TODAY).map((r) => [r.repo_id, r]));
const prevSnaps = new Map(PREV ? db.prepare(`select repo_id, stars from snapshots where scan_date=?`).all(PREV).map((r) => [r.repo_id, r]) : []);
const verified = new Map(db.prepare(`select m.repo_id, m.npm_name, p.weekly_downloads, p.range_week, p.range_prev, p.growth_pct
  from repo_npm_map m join npm_packages p on p.name=m.npm_name where m.confidence>=0.85`).all().map((r) => [r.repo_id, r]));
const rel = new Map(db.prepare(`select repo_id, downloads from release_cache`).all().map((r) => [r.repo_id, r.downloads]));

const rows = [];
for (const repo of repos) {
  const snap = snaps.get(repo.id);
  if (!snap) continue;
  const npm = verified.get(repo.id) ?? null;
  const age = days(repo.created_at);
  const freshList = [days(repo.pushed_at), days(repo.last_commit_at)].filter((v) => v !== null && v >= 0);
  const fresh = freshList.length ? Math.min(...freshList) : null;
  const prevSnap = prevSnaps.get(repo.id);
  const starDelta = prevSnap ? snap.stars - prevSnap.stars : null;
  const growth = npm && npm.range_week !== null && npm.range_prev !== null && npm.range_prev >= 10
    ? (npm.range_week - npm.range_prev) / (npm.range_prev + 200) : null;
  const weekly = snap.npm_weekly > 0 ? snap.npm_weekly : (npm?.weekly_downloads ?? null);
  rows.push({
    repoId: repo.id,
    description: repo.description ?? '',
    stars: snap.stars,
    forks: repo.forks,
    openIssues: repo.open_issues,
    ageDays: age,
    freshDays: fresh,
    npmName: npm?.npm_name ?? null,
    weekly,
    week: npm?.range_week ?? null,
    prev: npm?.range_prev ?? null,
    growth,
    rawGrowthPct: npm && npm.range_prev ? (npm.range_week - npm.range_prev) / npm.range_prev : null,
    starPerDay: age !== null ? snap.stars / Math.max(age, 7) : null,
    starDelta,
    starDeltaPerDay: starDelta !== null && prevDays ? starDelta / prevDays : null,
    release: rel.get(repo.id) ?? null,
    archived: repo.archived === 1,
  });
}

const eligible = rows.filter((r) => !r.archived && !/awesome/i.test(r.repoId) && r.ageDays !== null && r.ageDays <= 180
  && r.stars <= 20000 && (r.weekly !== null || r.stars >= 20));

const pctRank = (sorted, value) => {
  if (value === null || value === undefined || !sorted.length) return null;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; }
  return lo / Math.max(1, sorted.length - 1);
};

const starVals = eligible.map((r) => r.starPerDay).filter((v) => v !== null).sort((a, b) => a - b);
const momVals = eligible.map((r) => r.growth).filter((v) => v !== null).sort((a, b) => a - b);
const trVals = eligible.map((r) => r.weekly).filter((v) => v !== null).map((v) => Math.log10(v + 1)).sort((a, b) => a - b);
const histVals = eligible.map((r) => r.starDeltaPerDay).filter((v) => v !== null).sort((a, b) => a - b);

const weights = { momentum: 0.35, star: 0.25, traction: 0.20, history: 0.10, fresh: 0.10 };
for (const r of eligible) {
  const s = {
    momentum: r.growth === null ? null : pctRank(momVals, r.growth),
    star: r.starPerDay === null ? null : pctRank(starVals, r.starPerDay),
    traction: r.weekly === null ? null : pctRank(trVals, Math.log10(r.weekly + 1)),
    history: r.starDeltaPerDay === null ? null : pctRank(histVals, r.starDeltaPerDay),
    fresh: r.freshDays === null ? null : Math.exp(-r.freshDays / 45),
  };
  let sum = 0, wsum = 0, used = 0;
  for (const k of Object.keys(weights)) {
    if (s[k] === null) continue;
    sum += s[k] * weights[k];
    wsum += weights[k];
    used++;
  }
  const hasNpm = s.momentum !== null || s.traction !== null;
  const hasStarStory = s.star !== null && s.history !== null;
  r.s = s;
  r.coverage = wsum;
  r.used = used;
  r.potential = used >= 2 && wsum >= 0.45 && (hasNpm || hasStarStory) ? (sum / wsum) * 100 : null;
}

const ranked = eligible.filter((r) => r.potential !== null).sort((a, b) => b.potential - a.potential || b.stars - a.stars);
const fmt = (n) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-US'));
console.log('eligible', eligible.length, 'ranked', ranked.length,
  'with weekly', eligible.filter((r) => r.weekly !== null).length,
  'with momentum', eligible.filter((r) => r.growth !== null).length);
for (const r of ranked.slice(0, 45)) {
  console.log([
    r.potential.toFixed(1).padStart(5),
    r.repoId.padEnd(44),
    fmt(r.stars).padStart(7) + '★',
    fmt(r.weekly).padStart(8) + '/wk',
    (r.rawGrowthPct === null ? '—' : (r.rawGrowthPct * 100).toFixed(0) + '%').padStart(7),
    (r.starPerDay === null ? '—' : r.starPerDay.toFixed(1) + '★/d').padStart(8),
    (r.freshDays === null ? '—' : r.freshDays.toFixed(0) + 'd').padStart(4),
    (r.ageDays === null ? '—' : r.ageDays.toFixed(0) + 'd').padStart(5),
    r.npmName ?? '',
  ].join('  '));
}

writeFileSync(join(here, 'potential-v4.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  today: TODAY,
  prev: PREV,
  prevDays,
  filters: { maxAgeDays: 180, maxStars: 20000, npmPreferred: true, excludes: ['archived', 'awesome-*'] },
  weights,
  counts: {
    reposWithSnapshot: rows.length,
    eligible: eligible.length,
    ranked: ranked.length,
    weeklyPositive: eligible.filter((r) => r.weekly !== null).length,
    withMomentum: eligible.filter((r) => r.growth !== null).length,
  },
  ranked,
}, null, 2));
