/** Retention proxy & risk — issue #22.
 *
 *  The current authoritative snapshot has NO continuous per-repo install
 *  series, so a true retention number cannot be computed. This module (a)
 *  defines the snapshot fields needed to close the loop, (b) exposes proxy
 *  formulas that activate once those fields exist, and (c) flags the
 *  observable "high downloads + negative growth" pattern as retention risk
 *  so it is never presented as a first-choice recommendation.
 */
import { ROW } from './schema.mjs';

export const HIGH_DOWNLOAD_MIN = 1000;
export const RISK_LABEL = '⚠ 存量留存风险';
/** Three cases explicitly called out in issue #22 — always rendered. */
export const NAMED_RISK_CASES = Object.freeze([
  'pc2005-cloud/dsh-pet',
  'zhu1090093659/dsh-skins',
  'small-tailqwq/dsh-deep-whale',
]);

/** Fields the scanner must record to make retention measurable. */
export const RETENTION_FIELDS = Object.freeze([
  { field: 'installs_new', definition: '本期首次安装数（新装机代理）' },
  { field: 'installs_returning', definition: '本期复装/回访安装数（留存代理）' },
  { field: 'weekly_prev', definition: '上一连续快照的 npm 周下载；用于连续序列代理' },
]);

export function snapshotRetentionAvailability(meta) {
  const present = (meta.retention && typeof meta.retention === 'object') ? meta.retention : {};
  const available = RETENTION_FIELDS.every((f) => present[f.field] != null);
  return {
    available,
    fields: RETENTION_FIELDS.map((f) => ({ ...f, present: present[f.field] != null })),
    note: available ? '连续快照字段齐全，可计算留存代理' : '权威快照未提供连续 install 序列；留存代理不可计算，必须写明"待连续快照"',
  };
}

/** obs = { installsNew, installsReturning, weeklyPrev } for one repo. */
export function retentionProxy(obs = {}) {
  const n = obs.installsNew, r = obs.installsReturning, prev = obs.weeklyPrev;
  const returningShare = (n != null && r != null && n + r > 0) ? r / (n + r) : null;
  const reinstallRatio = (r != null && prev != null && prev > 0) ? r / prev : null;
  const continuity = (obs.weekly != null && prev != null && prev > 0)
    ? Math.min(1, obs.weekly / prev)
    : null;
  return {
    returningShare,
    reinstallRatio,
    continuity,
    status: returningShare != null ? 'available' : 'unavailable',
    caveat: '下载=装机代理，非活跃用户数；复装/回访不直接等于活跃留存',
  };
}

export function isRetentionRisk(row) {
  const g = row[ROW.GROWTH];
  return (row[ROW.WEEKLY] ?? 0) >= HIGH_DOWNLOAD_MIN && g != null && Number.isFinite(g) && g < 0;
}

export function riskFlag(row) {
  return isRetentionRisk(row) ? ` ${RISK_LABEL}` : '';
}

export function retentionStats(rows, downloadTop = []) {
  const risky = rows.filter(isRetentionRisk);
  const top = downloadTop.filter((x) => x.growth != null && x.growth < 0);
  return {
    riskyCount: risky.length,
    downloadTopNegative: top.length,
    downloadTopTotal: downloadTop.length,
    named: NAMED_RISK_CASES.map((id) => {
      const r = rows.find((x) => x[ROW.ID] === id);
      return r ? { id, weekly: r[ROW.WEEKLY], growth: r[ROW.GROWTH], flagged: isRetentionRisk(r) } : { id, missing: true };
    }),
    samples: risky
      .sort((a, b) => b[ROW.WEEKLY] - a[ROW.WEEKLY])
      .slice(0, 15)
      .map((r) => ({ id: r[ROW.ID], weekly: r[ROW.WEEKLY], growth: r[ROW.GROWTH], score: r[ROW.SCORE] })),
  };
}

export function renderRetention(rows, meta, downloadTop = []) {
  const a = snapshotRetentionAvailability(meta);
  const s = retentionStats(rows, downloadTop);
  const lines = [
    '## RETENTION PROXY & RISK (issue #22)',
    '',
    '> **下载 = 装机代理，非活跃用户数**：周下载只说明「装了多少次」，不能推断「多少人在用」；`weekly=null` 是无观测，不是 0。',
    '',
    '快照需补字段（当前权威快照全部缺失 → 留存代理不可计算）：',
    ...a.fields.map((f) => `  - \`${f.field}\`${f.present ? ' ✓' : ' ✗'} — ${f.definition}`),
    '',
    `- 可用性：${a.available ? '可计算' : '不可计算（待连续快照）'}。${a.note}`,
    `- 高下载（weekly≥${HIGH_DOWNLOAD_MIN.toLocaleString('en-US')}）+ 负增长 = ${RISK_LABEL}：全库 ${s.riskyCount.toLocaleString('en-US')} 仓；\`meta.downloadTop\` 中 ${s.downloadTopNegative}/${s.downloadTopTotal} 仓为负增长。`,
    '- 处理规则：列入留存风险观察，不列入首选推荐；连续快照到位后用 `retentionProxy()` 的复装占比 / 回访比 / 连续性代理复算。',
    '',
    'issue #22 点名案例（无论周下载排名都显式列出）：',
    ...s.named.map((x) => `  - ${x.id} wk=${x.weekly} grow=${x.growth} → ${x.flagged ? RISK_LABEL : '未触发'}`),
    '',
    '风险样本（按周下载降序，前 15）：',
    ...s.samples.map((x) => `  - ${x.id} wk=${x.weekly} grow=${x.growth} score=${x.score} — ${RISK_LABEL}`),
  ];
  return lines.join('\n') + '\n';
}
