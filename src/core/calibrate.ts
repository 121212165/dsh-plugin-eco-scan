/** Out-of-sample calibration. With at least two snapshots we can ask the only
 * question that matters: did the ranking at T0 predict what actually grew by
 * T1? Spearman over ranks, not Pearson over levels, because both signals are
 * monotone at best. The baseline is the naive "biggest package wins" rule, so
 * a report can show whether the scoring adds anything over sorting by volume. */
import type { EcoDb } from './db.ts';
import { scoredSet } from './queries.ts';
import { snapshotDates } from './storage.ts';
import { MIN_PREV_FOR_VELOCITY, smoothedGrowth } from './scoring.ts';
import { round } from './util.ts';

export interface CalibrationPair {
  repoId: string;
  velocity: number;
  score: number;
  baseline: number;
  realized: number;
  fromWeekly: number;
  toWeekly: number;
}

export interface CalibrationReport {
  from: string | null;
  to: string | null;
  pairs: number;
  spearman: number | null;
  scoreSpearman: number | null;
  baselineSpearman: number | null;
  topOverlap: { k: number; velocity: number; score: number; baseline: number } | null;
  reason: string | null;
  rows: CalibrationPair[];
}

export function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const out = new Array<number>(values.length);
  let cursor = 0;
  while (cursor < order.length) {
    let end = cursor;
    while (end + 1 < order.length && order[end + 1]?.value === order[cursor]?.value) end++;
    const rank = (cursor + end) / 2 + 1;
    for (let index = cursor; index <= end; index++) out[order[index]?.index ?? 0] = rank;
    cursor = end + 1;
  }
  return out;
}

/** Pearson correlation of ranks; null when there is too little data or one side
 * is constant (undefined correlation, not zero). */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = rx.length;
  const mx = rx.reduce((sum, value) => sum + value, 0) / n;
  const my = ry.reduce((sum, value) => sum + value, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let index = 0; index < n; index++) {
    const a = (rx[index] ?? 0) - mx;
    const b = (ry[index] ?? 0) - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? null : round(num / denom, 4);
}

function overlap(pairs: readonly CalibrationPair[], by: (pair: CalibrationPair) => number, k: number): Set<string> {
  return new Set(
    [...pairs]
      .sort((a, b) => by(b) - by(a) || a.repoId.localeCompare(b.repoId))
      .slice(0, k)
      .map((pair) => pair.repoId),
  );
}

export function calibrate(db: EcoDb, options: { from?: string; to?: string; k?: number } = {}): CalibrationReport {
  const dates = snapshotDates(db);
  const to = options.to ?? dates[dates.length - 1] ?? null;
  const from = options.from ?? (to ? [...dates].reverse().find((date) => date < to) ?? null : null);
  const empty: CalibrationReport = {
    from,
    to,
    pairs: 0,
    spearman: null,
    scoreSpearman: null,
    baselineSpearman: null,
    topOverlap: null,
    reason: null,
    rows: [],
  };
  if (!from || !to || from >= to) {
    return { ...empty, reason: '需要至少两个不同日期的快照才能做样本外校准（先跑两次 /eco-scan）' };
  }

  const fromWeekly = new Map<string, number | null>();
  const toWeekly = new Map<string, number | null>();
  const readWeekly = (date: string, into: Map<string, number | null>): void => {
    const rows = db.raw
      .prepare('SELECT repo_id, npm_weekly FROM snapshots WHERE scan_date = ?')
      .all(date) as unknown as { repo_id: string; npm_weekly: number | null }[];
    for (const row of rows) into.set(row.repo_id, row.npm_weekly);
  };
  readWeekly(from, fromWeekly);
  readWeekly(to, toWeekly);

  // Point-in-time only: `scoredSet` falls back to the *current* npm_packages
  // row when a snapshot lacks a weekly value, which would contaminate a
  // historical baseline with today's number and fake a zero change.
  const pairs: CalibrationPair[] = [];
  for (const score of scoredSet(db, from).scores) {
    if (score.insufficient) continue;
    const earlier = fromWeekly.get(score.repoId);
    if (earlier === null || earlier === undefined || earlier < MIN_PREV_FOR_VELOCITY) continue;
    const later = toWeekly.get(score.repoId);
    if (later === null || later === undefined) continue;
    const realized = smoothedGrowth(later, earlier);
    if (realized === null) continue;
    pairs.push({
      repoId: score.repoId,
      velocity: score.velocity,
      score: score.score,
      baseline: earlier,
      realized,
      fromWeekly: earlier,
      toWeekly: later,
    });
  }

  if (pairs.length < 3) {
    return { ...empty, pairs: pairs.length, reason: '两期重叠且有双侧周下载的仓库不足 3 个，无法计算秩相关' };
  }
  const k = Math.max(1, options.k ?? 10);
  const realized = pairs.map((pair) => pair.realized);
  const realizedTop = overlap(pairs, (pair) => pair.realized, k);
  const hits = (by: (pair: CalibrationPair) => number): number => [...overlap(pairs, by, k)].filter((id) => realizedTop.has(id)).length;

  return {
    from,
    to,
    pairs: pairs.length,
    spearman: spearman(pairs.map((pair) => pair.velocity), realized),
    scoreSpearman: spearman(pairs.map((pair) => pair.score), realized),
    baselineSpearman: spearman(pairs.map((pair) => pair.baseline), realized),
    topOverlap: {
      k,
      velocity: hits((pair) => pair.velocity),
      score: hits((pair) => pair.score),
      baseline: hits((pair) => pair.baseline),
    },
    reason: null,
    rows: [...pairs].sort((a, b) => b.velocity - a.velocity).slice(0, 10),
  };
}

export function renderCalibration(report: CalibrationReport): string {
  if (report.reason) return `校准 ${report.from ?? '?'} → ${report.to ?? '?'}：${report.reason}`;
  const lines = [
    `样本外校准 ${report.from} → ${report.to} · ${report.pairs} 个双边可测仓库`,
    `秩相关（预测 vs 实际变化）：velocity ${fmt(report.spearman)} · 综合分 ${fmt(report.scoreSpearman)} · 基线「周下载最大」 ${fmt(report.baselineSpearman)}`,
  ];
  if (report.topOverlap) {
    const { k, velocity, score, baseline } = report.topOverlap;
    lines.push(`Top${k} 命中（实际变化 Top${k}）：velocity ${velocity}/${k} · 综合分 ${score}/${k} · 基线 ${baseline}/${k}`);
  }
  if (report.rows.length) {
    lines.push('前 10 个高 velocity 仓库的实际变化：');
    for (const row of report.rows) {
      const pct = Math.round(row.realized * 1000) / 10;
      lines.push(`  ${row.repoId.padEnd(40)} ${row.fromWeekly} → ${row.toWeekly}（${pct >= 0 ? '+' : ''}${pct}%） v${row.velocity}`);
    }
  }
  return lines.join('\n');
}

function fmt(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}
