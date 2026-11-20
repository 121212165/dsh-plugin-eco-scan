/** Growth coverage & outlier controls — issue #15.
 *
 *  `row[4]` in this snapshot is the RAW period-over-period percentage. It is
 *  NOT the smoothed velocity used by src/core/scoring.ts (prior 20, min prev 5)
 *  and NOT the alert rule's minPrev=20 floor. Every report that cites it must
 *  carry the coverage annotation produced here.
 */
import { ROW } from './schema.mjs';

export const OUTLIER = Object.freeze({ ABS_PCT: 100, MAX_STARS: 100 });
export const nf = (n) => n.toLocaleString('en-US');

export function isGrowthOutlier(row) {
  const g = row[ROW.GROWTH];
  return g != null && Number.isFinite(g) && Math.abs(g) > OUTLIER.ABS_PCT && (row[ROW.STARS] ?? 0) < OUTLIER.MAX_STARS;
}

/** Every growth citation must be paired with this note (issue #15). */
export function growthCoverageNote(rows) {
  const s = growthCoverage(rows);
  return `growth：n=${nf(s.withGrowth)}，覆盖 ${s.coveragePct}%（全库 ${nf(s.total)}，缺失 ${nf(s.missing)}；单快照样本信号，不可当全量结论）`;
}

export function growthCoverage(rows) {
  const values = rows.map((r) => r[ROW.GROWTH]).filter((x) => x != null && Number.isFinite(x));
  const withGrowth = values.length;
  return {
    total: rows.length,
    withGrowth,
    missing: rows.length - withGrowth,
    coveragePct: rows.length ? ((withGrowth / rows.length) * 100).toFixed(1) : '0.0',
    max: values.length ? Math.max(...values) : null,
    min: values.length ? Math.min(...values) : null,
    over100: values.filter((x) => x > 100).length,
    outlier: rows.filter(isGrowthOutlier).length,
  };
}

/** Growth ranking that never admits a raw small-base outlier. */
export function rankGrowthSafe(rows, n = 15) {
  return rows
    .filter((r) => {
      const g = r[ROW.GROWTH];
      return g != null && Number.isFinite(g) && g > 0 && !isGrowthOutlier(r);
    })
    .sort((a, b) => b[ROW.GROWTH] - a[ROW.GROWTH])
    .slice(0, n);
}

export function growthFlag(row) {
  return isGrowthOutlier(row) ? ' ⚠异常(未清洗)' : '';
}

export function renderGrowthQuality(rows) {
  const s = growthCoverage(rows);
  const bad = rows.filter(isGrowthOutlier).sort((a, b) => Math.abs(b[ROW.GROWTH]) - Math.abs(a[ROW.GROWTH])).slice(0, 5);
  const safe = rankGrowthSafe(rows, 10);
  const lines = [
    '## GROWTH QUALITY (issue #15)',
    '',
    `> ${growthCoverageNote(rows)}`,
    '',
    `- |growth|>100 的仓=${nf(s.over100)} ｜ 其中 |growth|>100 且 stars<100 标记为异常=${nf(s.outlier)}（不进增长榜）`,
    `- 原始极值 max=${s.max} / min=${s.min}；异常判据：|row[4]|>100 且 row[2]<100`,
    `- 口径辨析：本字段是 raw=(latest−prev)/prev，无平滑先验；评分 velocity 用 (weekly−prev)/(prev+20) 且 prev<5 记 insufficient；告警 minPrev=20 是告警触发下限。三者不是同一个阈值（见 DATA-DICTIONARY.md §8）。`,
    '',
    '被排除的异常样本（score 高也不放行）：',
    ...bad.map((r) => `  - ${r[ROW.ID]} growth=${r[ROW.GROWTH]} ★=${r[ROW.STARS]} score=${r[ROW.SCORE]}`),
    '',
    '清洗后增长榜（正数、非异常，仍必须带覆盖率注记）：',
    ...safe.map((r, i) => `  ${i + 1}. ${r[ROW.ID]} growth=${r[ROW.GROWTH]} ★=${r[ROW.STARS]} wk=${r[ROW.WEEKLY]}`),
  ];
  return lines.join('\n') + '\n';
}
