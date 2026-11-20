import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROW, stats } from './schema.mjs';
import { mainBoard, renderQualityGate } from './quality-gate.mjs';

// rows[] is a POSITIONAL array. Source of truth: data/DATA-DICTIONARY.md.
//   [0] id (owner/repo)      [1] score                 [2] stars
//   [3] weekly (npm)         [4] growth% (nullable)    [5] ageDays (nullable)
//   [6] segIdx               [7] activity              [8] archived (0/1)
//   [9] tagIdx[] (NUMERIC indexes into meta.tags)      [10] isEnriched (0/1, NOT isMain)
//   [11] coverage            [12] lowSignal (0/1)      [13] starVel (dead in this snapshot: always null)
//   [14] description         [15] license              [16] latest_version      [17] owner
// NOTE: [10] is isEnriched (not isMain); [11] is coverage; [13] is star velocity,
// kept for positional compatibility but null for all 38,549 rows (no comparable snapshot yet).
const famOf = (TAGS, i) => TAGS[i]?.fam ?? '?';
const nameOf = (TAGS, i) => TAGS[i]?.name ?? '?';

/** Reference global score sort kept intact for the issue #12 contract:
 *  no isEnriched/star shortcut. The *published* leaderboard below additionally
 *  applies the issue #19 quality gate via `mainBoard`. */
export function topByScore(rows, n = 60) {
  return [...rows].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function buildDigest(D) {
  const M = D.meta, ROWS = D.rows;
  const T = M.tags;
  const fam = (i) => famOf(T, i);
  const name = (i) => nameOf(T, i);

  let out = '# ECO DATA DIGEST (snapshot ' + M.date + ')\n\n';
  out += '> 榜单口径已修正（2026-11-20）：Top60 现为**全局 score 排序**，不再使用 `r[10]===1 || r[2]>2000` 过滤。\n\n';
  out += 'Total repos: ' + ROWS.length + '\n';
  out += 'Counts: ' + JSON.stringify(M.counts) + '\n\n';

  out += '## COLUMN NAMES (see data/DATA-DICTIONARY.md)\n';
  out += (M.columns || []).map((c) => `- [${c.index}] \`${c.field}\` — ${c.meaning}${c.nullSemantics ? '（空值：' + c.nullSemantics + '）' : ''}`).join('\n') + '\n\n';

  out += '## TAG ID CROSSWALK\n';
  out += '`meta.tags[].id` 是 slug，`rows[].tags` 存数字下标；用 `meta.tagIndex[slug]` 转换。\n';
  out += '示例：' + (M.tagIndex ? Object.entries(M.tagIndex).slice(0, 5).map(([s,i]) => `${s}→${i}`).join(', ') : '(no tagIndex)') + '\n\n';

  // per-tag stats
  const byTag = new Map();
  ROWS.forEach(r => (r[9]||[]).forEach(t => { if(!byTag.has(t)) byTag.set(t,[]); byTag.get(t).push(r); }));

  out += '## PER-TAG STATS\n';
  out += '| tagIdx | slug | name | fam | n | ★med | ★p90 | weekly med | weekly sum | growth med | +growth | new≤30d |\n';
  out += '|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const [t, list] of [...byTag.entries()].sort((a,b)=>b[1].length-a[1].length)) {
    const s = stats(list);
    const slug = T[t]?.id ?? '?';
    out += `| ${t} | ${slug} | ${name(t)} | ${fam(t)} | ${s.n} | ${s.starsMedian??'-'} | ${s.starsP90??'-'} | ${s.weeklyMedian??'-'} | ${s.weeklySum} | ${s.growthMedian??'-'} | ${s.growthPositive} | ${s.new30} |\n`;
  }

  out += '\n## FAMILY ROLLUP\n';
  const famMap = new Map();
  T.forEach((t,i)=> { if(!famMap.has(t.fam)) famMap.set(t.fam,[]); famMap.get(t.fam).push(i); });
  for (const [f, ids] of famMap) {
    const set = new Set(); ROWS.forEach(r => (r[9]||[]).forEach(t=>{ if(ids.includes(t)) set.add(r); }));
    const s = stats([...set]);
    out += `- **${f}** (tags: ${ids.map(name).join(', ')}): repos=${s.n}, ★med=${s.starsMedian}, weekly med=${s.weeklyMedian}, weekly sum=${s.weeklySum}, growth med=${s.growthMedian}, new≤30d=${s.new30}\n`;
  }

  const board = mainBoard(ROWS, 60);
  out += '\n' + renderQualityGate(ROWS, board);

  out += '\n## TOP 60 — MAIN BOARD (quality-gated, score-sorted)\n';
  out += '> 排序仍是全局 score 降序（issue #12），但先经 issue #19 门禁剔除归档与 coverage<0.4 的空壳；`topByScore()` 保留为无门禁的参照函数。\n';
  for (const [i, r] of board.entries()) {
    out += `${i+1}. ${r[0]} | score=${r[1]} | ★=${r[2]} | wk=${r[3]} | grow=${r[4]} | age=${r[5]}d | seg=${r[6]} | cov=${r[11]} | enr=${r[10]} | tags=[${(r[9]||[]).map(name).join(',')}]\n`;
  }

  out += '\n## ENRICHED SAMPLES (row[10]=1, label + summary)\n';
  const enriched = ROWS.filter(r => r[10] === 1).sort((a,b)=>b[1]-a[1]).slice(0, 25);
  if (!enriched.length) out += '(none)\n';
  for (const r of enriched) {
    const labels = (r[9]||[]).map(name).filter(Boolean).join(' / ') || '(no capability tags)';
    const summary = r[14] || '(no summary available in this snapshot)';
    out += `- **${r[0]}** [score=${r[1]}, cov=${r[11]}]\n  - 标签：${labels}\n  - 摘要：${summary}\n  - owner：${r[17] ?? '-'} ｜ license：${r[15] ?? '未知'} ｜ version：${r[16] ?? '未知'}\n`;
  }

  out += '\n## MATRIX (parent × capability cell counts)\n';
  if (M.matrix) {
    out += 'parents: ' + M.matrix.parents.map(name).join(' | ') + '\n';
    out += 'caps: ' + M.matrix.caps.map(name).join(' | ') + '\n';
    const P=M.matrix.parents, C=M.matrix.caps;
    for (let i=0;i<P.length;i++){
      const row=M.matrix.cells[i]||[];
      out += `${name(P[i])}: ` + row.map((c,j)=> c.n>0 ? `${name(C[j])}=${c.n}` : '').filter(Boolean).join(', ') + '\n';
    }
  }

  out += '\n## HEAT (tag weekly volume trend, last 26 weeks)\n';
  (M.heat||[]).forEach(h => { out += `${name(h.tag)} (total=${h.total}): ${h.cells.join(',')}\n`; });

  out += '\n## DOWNLOAD TOP 30\n';
  (M.downloadTop||[]).slice(0,30).forEach((x,i)=>{ out += `${i+1}. ${x.repo} wk=${x.weekly} ★=${x.stars} grow=${x.growth}\n`; });

  return out;
}

function main() {
  const D = JSON.parse(fs.readFileSync(new URL('./eco-data.json', import.meta.url), 'utf8'));
  const out = buildDigest(D);
  fs.writeFileSync(new URL('./digest.md', import.meta.url), out);
  console.log('wrote digest.md, length', out.length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
