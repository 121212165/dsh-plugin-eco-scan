/** Ranking quality gates — issue #19.
 *
 *  The global score sort (`topByScore` in digest.mjs) stays intact so the
 *  issue #12 contract is preserved; this module is the *eligibility layer*
 *  applied before a score-sorted list is called a "main board" / recommendation.
 *
 *  Gate rules:
 *    - archived (row[8] === 1) is excluded (or must be visibly flagged);
 *    - coverage < 0.4 (row[11]) is a low-signal shell and is excluded.
 *  Note row[12] `lowSignal` uses coverage < 0.5 and is NOT the gate threshold.
 */
import { ROW, stats } from './schema.mjs';

export const GATE = Object.freeze({
  MIN_COVERAGE: 0.4,
  EXCLUDE_ARCHIVED: true,
});

export function isArchived(row) {
  return row[ROW.ARCHIVED] === 1;
}

export function isLowSignal(row) {
  const cov = row[ROW.COVERAGE];
  return cov == null || cov < GATE.MIN_COVERAGE;
}

/** Human-readable reasons why a row is not eligible for the main board. */
export function gateReasons(row) {
  const reasons = [];
  if (GATE.EXCLUDE_ARCHIVED && isArchived(row)) reasons.push('archived');
  if (isLowSignal(row)) reasons.push(`coverage<${GATE.MIN_COVERAGE}`);
  return reasons;
}

export function passesQualityGate(row) {
  return gateReasons(row).length === 0;
}

/** Self-check counters required by issue #19. Counts are disjoint where noted. */
export function gateStats(rows) {
  let archived = 0, lowSignal = 0, both = 0, eligible = 0;
  for (const r of rows) {
    const a = isArchived(r), l = isLowSignal(r);
    if (a) archived++;
    if (l) lowSignal++;
    if (a && l) both++;
    if (!a && !l) eligible++;
  }
  return {
    total: rows.length,
    archived,
    lowSignal,
    both,
    excluded: archived + lowSignal - both,
    eligible,
  };
}

/** Score-sorted main board: quality gate first, then the #12 global score sort. */
export function mainBoard(rows, n = 60) {
  return rows
    .filter(passesQualityGate)
    .sort((a, b) => b[ROW.SCORE] - a[ROW.SCORE])
    .slice(0, n);
}

/** Highest-scoring excluded rows — proof that the gate actually removes rows. */
export function excludedSamples(rows, n = 5) {
  const excluded = rows.filter((r) => !passesQualityGate(r));
  const archived = excluded.filter(isArchived).sort((a, b) => b[ROW.SCORE] - a[ROW.SCORE]).slice(0, n);
  const lowSignal = excluded.filter(isLowSignal).sort((a, b) => b[ROW.SCORE] - a[ROW.SCORE]).slice(0, n);
  return { archived, lowSignal };
}

/** Assert the invariant used by the digest self-check: no bad row may appear. */
export function assertCleanBoard(board) {
  const bad = board.filter((r) => !passesQualityGate(r));
  if (bad.length) {
    throw new Error(`quality gate leaked ${bad.length} row(s) into main board: ${bad.slice(0, 3).map((r) => r[ROW.ID]).join(', ')}`);
  }
  return { checked: board.length, archived: 0, lowSignal: 0 };
}

export function renderQualityGate(rows, board) {
  const g = gateStats(rows);
  const check = assertCleanBoard(board);
  const ex = excludedSamples(rows, 3);
  const lines = [
    '## QUALITY GATE SELF-CHECK (issue #19)',
    '',
    `> 门禁：排除 \`archived=1\` 与 \`coverage<${GATE.MIN_COVERAGE}\`（低信号空壳）。注意 \`row[12]=lowSignal\` 用的是 coverage<0.5，与门禁阈值不同。`,
    '',
    `- 全库=${g.total} ｜ 归档=${g.archived} ｜ coverage<${GATE.MIN_COVERAGE}=${g.lowSignal} ｜ 两者交集=${g.both} ｜ 门禁排除合计=${g.excluded} ｜ 可入榜=${g.eligible}`,
    `- 主榜自检：检查 ${check.checked} 行 → 归档入榜 ${check.archived} ｜ 低信号入榜 ${check.lowSignal}（必须为 0）`,
    '',
    '被门禁排除的最高分样本（证明门禁真实生效，不是空规则）：',
  ];
  for (const r of ex.archived) {
    lines.push(`  - [归档] ${r[ROW.ID]} score=${r[ROW.SCORE]} cov=${r[ROW.COVERAGE]} wk=${r[ROW.WEEKLY]}`);
  }
  for (const r of ex.lowSignal) {
    lines.push(`  - [低信号] ${r[ROW.ID]} score=${r[ROW.SCORE]} cov=${r[ROW.COVERAGE]} age=${r[ROW.AGE]}d wk=${r[ROW.WEEKLY]}`);
  }
  return lines.join('\n') + '\n';
}
