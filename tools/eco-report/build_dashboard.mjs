// Full-corpus ranking + fine-grained tags + growth aggregates from eco.db.
// Run: node --experimental-sqlite build_dashboard.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPIC_STOP, TAX, MISC } from './taxonomy.mjs';
import { tagRepo, parseTopics, percentile, upperBound, computeScore, median } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ECO_DATA_DIR || join(process.env.USERPROFILE || process.env.HOME, '.dsh', 'eco-scan');
const DAY = 86400000;
const db = new DatabaseSync(join(DATA_DIR, 'eco.db'), { readOnly: true });
const DATE = process.env.ECO_SNAPSHOT_DATE || db.prepare('SELECT MAX(scan_date) AS d FROM snapshots').get().d;
const NOW = Date.parse(DATE + 'T00:00:00Z');
// Previous scan date drives the real star-velocity series (#19).
const PREV_DATE = db.prepare('SELECT scan_date AS d FROM snapshots WHERE scan_date < ? GROUP BY scan_date ORDER BY d DESC LIMIT 1').get(DATE)?.d || null;
const prevStars = new Map();
const VEL_DAYS = PREV_DATE ? Math.max(1, (NOW - Date.parse(PREV_DATE + 'T00:00:00Z')) / DAY) : null;
if (PREV_DATE) {
  for (const p of db.prepare('SELECT repo_id AS id, stars FROM snapshots WHERE scan_date = ?').all(PREV_DATE)) {
    prevStars.set(p.id, p.stars);
  }
}

// ---------- taxonomy ----------
const TAGS = [...TAX, MISC].map((t, i) => ({ i, id: t[0], name: t[1], fam: t[2], re: t[3] || null }));
const TAG_INDEX = new Map(TAGS.map((t) => [t.id, t.i]));
const MISC_I = TAG_INDEX.get('misc');

function tagRepoIdx(name, desc, topics) {
  return tagRepo(name, desc, topics).map((id) => TAG_INDEX.get(id)).filter((i) => i != null);
}

// ---------- load ----------
const rawRows = db.prepare(`SELECT s.repo_id AS id, s.stars AS stars, s.npm_weekly AS weekly,
    s.segment AS seg, r.description AS desc, r.topics AS topics, r.language AS lang,
    r.created_at AS created, r.pushed_at AS pushed, r.archived AS archived
  FROM snapshots s JOIN repos r ON r.id = s.repo_id WHERE s.scan_date = ?`).all(DATE);

const growBest = new Map();
for (const g of db.prepare(`SELECT m.repo_id AS id, m.confidence AS c, p.range_week AS w, p.range_prev AS pv
  FROM repo_npm_map m JOIN npm_packages p ON p.name = m.npm_name WHERE m.confidence >= 0.85`).all()) {
  const cur = growBest.get(g.id);
  if (!cur || g.c > cur.c || (g.c === cur.c && (g.w ?? -1) > (cur.w ?? -1))) growBest.set(g.id, g);
}

const SEGS = ['framework-runtime','ui-client','tools-devx','other','search-knowledge','memory-context','archive-export','cost-budget','telemetry-analytics'];
const SEG_NAME = { 'framework-runtime':'框架/运行时','ui-client':'UI/客户端','tools-devx':'工具/开发体验','other':'其他','search-knowledge':'搜索/知识','memory-context':'记忆/上下文','archive-export':'归档/导出','cost-budget':'成本/预算','telemetry-analytics':'遥测/分析' };

const rows = rawRows.map((r) => {
  const createdMs = r.created ? Date.parse(r.created) : null;
  const pushedMs = r.pushed ? Date.parse(r.pushed) : null;
  const ageDays = createdMs ? Math.max(0, (NOW - createdMs) / DAY) : null;
  const pushDays = pushedMs ? Math.max(0, (NOW - pushedMs) / DAY) : null;
  const g = growBest.get(r.id);
  let growth = null, growthRawPct = null;
  if (g && g.w != null && g.pv != null && g.pv >= 10) {
    growth = (g.w - g.pv) / (g.pv + 200);
    growthRawPct = ((g.w - g.pv) / g.pv) * 100;
  }
  const topics = parseTopics(r.topics);
  return {
    id: r.id, stars: r.stars || 0, weekly: r.weekly ?? null, seg: r.seg || 'other',
    desc: r.desc || '', topics, lang: r.lang || '', createdMs, pushedMs, ageDays, pushDays,
    archived: r.archived ? 1 : 0, growth, growthRawPct,
    tags: tagRepoIdx(r.id, r.desc, topics),
  };
});

// ---------- percentile over signal-bearing repos only ----------
const starPos = rows.filter((r) => r.stars > 0).map((r) => r.stars).sort((a, b) => a - b);
const reachPos = rows.filter((r) => r.weekly != null && r.weekly > 0).map((r) => r.weekly).sort((a, b) => a - b);
const growthPos = rows.filter((r) => r.growth != null).map((r) => r.growth).sort((a, b) => a - b);
const pct = percentile;

for (const r of rows) {
  r.starPct = pct(starPos, r.stars);
  r.reachPct = r.weekly != null && r.weekly > 0 ? pct(reachPos, r.weekly) : 0;
  r.growthPct = r.growth != null ? (upperBound(growthPos, r.growth) / growthPos.length) * 100 : 0;
  r.activity = r.pushDays == null ? 0 : Math.max(0, Math.min(100, 100 * Math.exp(-r.pushDays / 90)));
  const sc = computeScore({ stars: r.stars, weekly: r.weekly, growth: r.growth, pushDays: r.pushDays, starPct: r.starPct, reachPct: r.reachPct, growthPct: r.growthPct, activity: r.activity });
  r.scoreOld = sc.scoreOld; r.coverage = sc.coverage; r.score = sc.score; r.lowSignal = sc.lowSignal;
  const prior = prevStars.get(r.id);
  if (prior == null) { r.starVel = null; r.starVelPct = null; }
  else {
    const delta = r.stars - prior;
    r.starVel = VEL_DAYS ? +(delta / VEL_DAYS).toFixed(2) : null;
    r.starVelPct = prior > 0 ? +(delta / prior * 100).toFixed(1) : null;
  }
}
const oldOrder = [...rows].sort((a, b) => b.scoreOld - a.scoreOld || b.stars - a.stars || a.id.localeCompare(b.id));
oldOrder.forEach((r, i) => { r.rankOld = i + 1; });
rows.sort((a, b) => b.score - a.score || b.stars - a.stars || a.id.localeCompare(b.id));
rows.forEach((r, i) => { r.rank = i + 1; });

// ---------- enrichment overlay: README/npm-derived capability tags for generic-only repos ----------
const ENRICH_CAP = 6;
let enriched = 0;
const enrichPath = join(here, 'enrichment-candidates.json');
if (existsSync(enrichPath)) {
  const cand = JSON.parse(readFileSync(enrichPath, 'utf8'));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const c of cand.results || []) {
    if (!c.gained || !c.gained.length) continue;
    const r = byId.get(c.id);
    if (!r) continue;
    const add = c.gained.map((id) => TAG_INDEX.get(id)).filter((i) => i != null && !r.tags.includes(i));
    if (!add.length) continue;
    r.tags = [...r.tags.filter((i) => i !== MISC_I), ...add].slice(0, ENRICH_CAP);
    r.enriched = 1;
    enriched++;
  }
}

// ---------- heatmap: tag x week (last 26 weeks of new repos) ----------
const WEEKS = 26;
const weekStart0 = NOW - WEEKS * 7 * DAY;
const weekLabels = [];
for (let i = 0; i < WEEKS; i++) weekLabels.push(new Date(weekStart0 + i * 7 * DAY).toISOString().slice(0, 10));
const heat = TAGS.map(() => new Array(WEEKS).fill(0));
const heatTotal = new Array(TAGS.length).fill(0);
for (const r of rows) {
  if (r.createdMs == null) continue;
  const wi = Math.floor((r.createdMs - weekStart0) / (7 * DAY));
  if (wi < 0 || wi >= WEEKS) continue;
  for (const ti of r.tags) { heat[ti][wi]++; heatTotal[ti]++; }
}
const heatRows = TAGS.map((t, i) => ({ tag: i, total: heatTotal[i] }))
  .filter((h) => h.total > 0 && h.tag !== MISC_I)
  .sort((a, b) => b.total - a.total)
  .slice(0, 18)
  .map((h) => ({ tag: h.tag, total: h.total, cells: heat[h.tag] }));

// ---------- lanes ----------
const lanes = TAGS.map((t, ti) => {
  const members = rows.filter((r) => r.tags.includes(ti));
  if (!members.length) return null;
  const new30 = members.filter((r) => r.ageDays != null && r.ageDays <= 30).length;
  const withGrowth = members.filter((r) => r.growthRawPct != null);
  const top = members.reduce((a, b) => (b.score > a.score ? b : a), members[0]);
  return {
    tag: ti, repos: members.length, new30, newShare: +(new30 / members.length * 100).toFixed(1),
    npm: members.filter((r) => r.reachPct > 0).length,
    weeklySum: members.reduce((s, r) => s + (r.weekly || 0), 0),
    growthMed: withGrowth.length ? +median(withGrowth.map((r) => r.growthRawPct)).toFixed(1) : null,
    starsSum: members.reduce((s, r) => s + r.stars, 0),
    top: top.id, topScore: top.score,
  };
}).filter(Boolean);

// ---------- parent x capability drill-down matrix ----------
const PARENT_IDS = ['agent', 'session', 'skill', 'workspace', 'llm'];
const GENERIC_IDS = ['agent', 'session', 'skill', 'workspace', 'llm', 'misc', 'cli', 'code', 'file', 'doc', 'awesome'];
const parentIdx = PARENT_IDS.map((id) => TAG_INDEX.get(id)).filter((i) => i != null);
const genericIdx = new Set(GENERIC_IDS.map((id) => TAG_INDEX.get(id)).filter((i) => i != null));
const capIdx = TAGS.map((t, i) => i).filter((i) => !genericIdx.has(i));
// Matrix shares the ranking's default noarch scope so cell counts == drill-down counts.
// Matrix shares the ranking's default scope: noarch, and low-coverage rows
// (no star / no download / no growth signal) are excluded so cell counts == drill-down.
const liveRows = rows.filter((r) => !r.archived && r.coverage >= 0.4);
const co = {};
const cellMap = {};
for (const pi of parentIdx) {
  const members = liveRows.filter((r) => r.tags.includes(pi));
  cellMap[pi] = {};
  for (const ci of capIdx) {
    const both = members.filter((r) => r.tags.includes(ci));
    if (!both.length) continue;
    cellMap[pi][ci] = { n: both.length, new30: both.filter((r) => r.ageDays != null && r.ageDays <= 30).length };
    co[ci] = (co[ci] || 0) + both.length;
  }
}
const capCols = capIdx.filter((ci) => co[ci]).sort((a, b) => co[b] - co[a]).slice(0, 16);
const matrix = {
  parents: parentIdx,
  caps: capCols,
  generic: [...genericIdx],
  parentTotal: parentIdx.map((pi) => liveRows.filter((r) => r.tags.includes(pi)).length),
  cells: parentIdx.map((pi) => capCols.map((ci) => cellMap[pi][ci] || { n: 0, new30: 0 })),
  genericOnly: parentIdx.map((pi) => {
    const g = liveRows.filter((r) => r.tags.includes(pi) && r.tags.every((t) => genericIdx.has(t)));
    return { n: g.length, new30: g.filter((r) => r.ageDays != null && r.ageDays <= 30).length };
  }),
};

const segCounts = SEGS.map((s) => ({ seg: s, name: SEG_NAME[s], repos: rows.filter((r) => r.seg === s).length }));

if (process.env.DEBUG_MISC) {
  const miscRows = rows.filter((r) => r.tags.length === 1 && r.tags[0] === MISC_I);
  console.log('MISC total', miscRows.length, 'empty/short desc', miscRows.filter((r) => !r.desc || r.desc.trim().length < 8).length);
  miscRows.filter((r) => r.desc && r.desc.trim().length >= 8).slice(0, 30).forEach((r) => console.log('M|', r.id, '|', r.desc.replace(/\s+/g,' ').slice(0, 110)));
}

const mainRows = rows.filter((r) => !r.archived && r.coverage >= 0.4);
const counts = {
  repos: rows.length,
  starPositive: starPos.length,
  weeklyPositive: reachPos.length,
  growthPositive: growthPos.length,
  archived: rows.filter((r) => r.archived).length,
  mainRows: mainRows.length,
  lowSignal: rows.filter((r) => r.lowSignal && !r.archived).length,
  reachCoveragePct: +(reachPos.length / Math.max(1, rows.length) * 100).toFixed(2),
  reachCoverageMainPct: +(mainRows.filter((r) => r.reachPct > 0).length / Math.max(1, mainRows.length) * 100).toFixed(2),
  coverage: [0.1, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((c) => ({ cov: c, n: rows.filter((r) => r.coverage === c).length })),
  velocity: {
    prevDate: PREV_DATE, days: VEL_DAYS,
    overlap: rows.filter((r) => r.starVel != null).length,
    note: rows.filter((r) => r.starVel != null).length >= 1000 ? null : '数据积累中：可比较的快照仓库太少',
  },
  new30: rows.filter((r) => r.ageDays != null && r.ageDays <= 30).length,
  young90: rows.filter((r) => r.ageDays != null && r.ageDays > 30 && r.ageDays <= 90).length,
  est: rows.filter((r) => r.ageDays != null && r.ageDays > 90).length,
  tags: TAGS.length,
  enriched,
};

// ---------- outputs ----------
const outDir = here;
const repoDir = join(process.env.ECO_REPO_DIR || 'C:/Users/lenovo/.zcode/workspace/default/dsh-plugin-eco-scan', 'reports', DATE);

// CSV (all rows, with description)
const csvEsc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvHead = ['rank','rank_old','repo','score','score_old','coverage','low_signal','stars','star_vel','star_vel_pct','weekly','growth_pct','age_days','activity','star_pct','reach_pct','growth_sig_pct','segment','tags','language','archived','description'];
const csvLines = [csvHead.join(',')];
for (const r of rows) {
  csvLines.push([r.rank, r.rankOld, r.id, r.score, r.scoreOld, r.coverage, r.lowSignal, r.stars, r.starVel ?? '', r.starVelPct ?? '', r.weekly ?? '', r.growthRawPct != null ? r.growthRawPct.toFixed(1) : '', r.ageDays != null ? Math.round(r.ageDays) : '', r.activity.toFixed(1), r.starPct.toFixed(1), r.reachPct.toFixed(1), r.growthPct.toFixed(1), r.seg, r.tags.map((i) => TAGS[i].id).join('|'), r.lang, r.archived, r.desc].map(csvEsc).join(','));
}
const csv = csvLines.join('\n');

// JSON (all rows, no description to keep size sane)
const jsonRows = rows.map((r) => ({
  rank: r.rank, rankOld: r.rankOld, repo: r.id, score: r.score, scoreOld: r.scoreOld,
  coverage: r.coverage, lowSignal: r.lowSignal, stars: r.stars, weekly: r.weekly,
  starVel: r.starVel, starVelPct: r.starVelPct,
  growthPct: r.growthRawPct != null ? +r.growthRawPct.toFixed(1) : null,
  ageDays: r.ageDays != null ? Math.round(r.ageDays) : null,
  activity: +r.activity.toFixed(1), starPct: +r.starPct.toFixed(1), reachPct: +r.reachPct.toFixed(1),
  growthSigPct: +r.growthPct.toFixed(1), segment: r.seg, tags: r.tags.map((i) => TAGS[i].id),
  language: r.lang, archived: r.archived, enriched: r.enriched || 0,
}));
const FORMULA_OLD = '0.40*starPct + 0.30*reachPct + 0.20*growthPct + 0.10*activity；缺项记 0';
const FORMULA_NEW = '(0.40*starPct + 0.30*reachPct + 0.20*growthPct + 0.10*activity) ÷ coverage；coverage<0.5 保留原始分并标低信号';
const ranking = {
  date: DATE, formula: FORMULA_NEW, formulaOld: FORMULA_OLD,
  counts,
  tags: TAGS.map((t) => ({ id: t.id, name: t.name, fam: t.fam })),
  rows: jsonRows,
};

// Old/new top-50 diff table for the 口径 note.
const top50New = rows.slice(0, 50);
const diff50 = top50New.map((r) => ({ repo: r.id, rankNew: r.rank, rankOld: r.rankOld, delta: r.rankOld - r.rank, scoreNew: r.score, scoreOld: r.scoreOld, coverage: r.coverage }))
  .filter((d) => d.delta !== 0 || d.scoreNew !== d.scoreOld);
const newTop50Ids = new Set(top50New.map((r) => r.id));
const dropped50 = oldOrder.slice(0, 50).filter((r) => !newTop50Ids.has(r.id))
  .map((r) => ({ repo: r.id, rankOld: r.rankOld, rankNew: r.rank, scoreOld: r.scoreOld, scoreNew: r.score, coverage: r.coverage }));
writeFileSync(join(here, 'scoring-diff.json'), JSON.stringify({
  date: DATE, formulaOld: FORMULA_OLD, formulaNew: FORMULA_NEW,
  counts: { repos: rows.length, mainRows: mainRows.length, lowSignal: counts.lowSignal, coverage: counts.coverage, reachCoveragePct: counts.reachCoveragePct, reachCoverageMainPct: counts.reachCoverageMainPct },
  oldTop20: oldOrder.slice(0, 20).map((r) => r.id),
  newTop20: rows.slice(0, 20).map((r) => r.id),
  top50Changed: diff50.length,
  top50Dropped: dropped50,
  top50Diff: diff50,
}, null, 1));

// compact rows for dashboard: [id, score, stars, weekly, growthRawPct(null), ageDays, segIdx, activity, archived, [tagIdx], enriched, coverage, lowSignal, starVel]
const segIdx = (s) => { const i = SEGS.indexOf(s); return i < 0 ? 3 : i; };
const compact = rows.map((r) => [r.id, r.score, r.stars, r.weekly, r.growthRawPct != null ? +r.growthRawPct.toFixed(1) : null, r.ageDays != null ? Math.round(r.ageDays) : null, segIdx(r.seg), +r.activity.toFixed(1), r.archived, r.tags, r.enriched || 0, r.coverage, r.lowSignal, r.starVel]);

const meta = {
  date: DATE, counts,
  formula: '综合 = 四项百分位加权 ÷ coverage（覆盖率）。覆盖越少，缺失信号越不被当成 0 分惩罚；coverage<0.5 不归一、标「低信号」。',
  formulaOld: FORMULA_OLD,
  scoringDiff: { changed: diff50.length, total: 50, sample: diff50.slice(0, 6) },
  velocityTop: rows.filter((r) => r.starVel != null)
    .sort((a, b) => b.starVel - a.starVel).slice(0, 15)
    .map((r) => ({ repo: r.id, stars: r.stars, delta: Math.round(r.starVel * VEL_DAYS), vel: r.starVel, pct: r.starVelPct })),
  weights: { star: 0.40, reach: 0.30, growth: 0.20, activity: 0.10 },
  segments: segCounts,
  weeks: weekLabels,
  heat: heatRows,
  lanes: lanes.sort((a, b) => b.new30 - a.new30 || b.repos - a.repos).slice(0, 26),
  tags: TAGS.map((t) => ({ id: t.id, name: t.name, fam: t.fam })),
  matrix,
};

const appJs = readFileSync(join(here, 'dashboard_app.js'), 'utf8');
const payload = JSON.stringify({ meta, rows: compact }).replace(/<\/script/gi, '<\\/script');
const html = readFileSync(join(here, 'dashboard_template.html'), 'utf8')
  .replace('/*__DATA__*/', payload)
  .replace('/*__APP__*/', appJs);

mkdirSync(repoDir, { recursive: true });
writeFileSync(join(outDir, 'full-ranking.csv'), csv, 'utf8');
writeFileSync(join(outDir, 'full-ranking.json'), JSON.stringify(ranking), 'utf8');
writeFileSync(join(outDir, 'tags-summary.json'), JSON.stringify({ date: DATE, counts, tags: meta.tags, segments: segCounts, lanes, matrix, heat: { weeks: weekLabels, rows: heatRows } }, null, 1), 'utf8');
writeFileSync(join(outDir, 'dashboard.html'), html, 'utf8');
writeFileSync(join(repoDir, 'full-ranking.csv'), csv, 'utf8');
writeFileSync(join(repoDir, 'full-ranking.json'), JSON.stringify(ranking), 'utf8');
writeFileSync(join(repoDir, 'dashboard.html'), html, 'utf8');

console.log('rows', rows.length, 'star+', starPos.length, 'weekly+', reachPos.length, 'growth+', growthPos.length);
console.log('top10');
rows.slice(0, 10).forEach((r) => console.log(r.rank, r.id, r.score, '★' + r.stars, 'w' + (r.weekly ?? '-'), r.tags.map((i) => TAGS[i].id).join(',')));
console.log('csv', (Buffer.byteLength(csv) / 1e6).toFixed(1) + 'MB', 'html', (Buffer.byteLength(html) / 1e6).toFixed(1) + 'MB');
console.log('lanes', meta.lanes.slice(0, 8).map((l) => TAGS[l.tag].name + ':' + l.repos + '/' + l.new30).join('  '));