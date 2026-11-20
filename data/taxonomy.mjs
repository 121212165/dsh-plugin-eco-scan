/** Taxonomy extension — issue #16.
 *
 *  `vertical` is an ORTHOGONAL multi-label dimension: it never replaces the
 *  existing 50 capability tags in `rows[9]`. A row may carry several verticals
 *  (or none -> `general` fallback) and, when it carries the `security`
 *  capability tag, an optional second-level `subclass`.
 *
 *  Assignments are derived at analysis time (not stored in rows[]) so the
 *  18-column positional contract from issue #17 stays intact. Every derived
 *  vertical carries the issue #18 risk label until semantically verified.
 */
import { ROW, stats } from './schema.mjs';
import { classifyByRule, RISK_LABEL } from './rules.mjs';
import { indexForSlug } from './tag-index.mjs';

export const VERTICALS = Object.freeze([
  { id: 'education', name: '教育 / 学术', definition: '教学、课程、学生、论文/学术场景' },
  { id: 'healthcare', name: '医疗 / 健康', definition: '临床、病历、医学标准（HL7/FHIR）、患者场景；工具隐喻默认排除' },
  { id: 'finance', name: '金融 / 行情', definition: '股票、行情、交易、基金、加密资产' },
  { id: 'gov', name: '政企 / 合规', definition: '政府、政策、法务、审计、采购、合规留存' },
  { id: 'content', name: '内容创作', definition: '写作、小说、博客、文章、音视频内容' },
  { id: 'ecommerce', name: '电商 / 零售', definition: '店铺、商城、购物车、订单、电商平台' },
  { id: 'general', name: '通用 / 未分类', definition: '无垂直信号的兜底桶；不代表"没有其他行业"' },
]);

export const SECURITY_SUBCLASSES = Object.freeze([
  { id: 'audit', name: '审计', keywords: ['audit', '审计', 'log', '日志'] },
  { id: 'masking', name: '脱敏', keywords: ['mask', '脱敏', 'redact', 'sanitize'] },
  { id: 'access-control', name: '权限', keywords: ['rbac', 'permission', '权限', 'auth', 'access'] },
  { id: 'supply-chain', name: '供应链', keywords: ['supply', '供应链', 'sbom', 'dependency', '依赖'] },
  { id: 'compliance-retention', name: '合规留存', keywords: ['compliance', '合规', 'retention', '留存', 'archive', '归档'] },
]);

export function verticalSchema() {
  return VERTICALS.map(({ id, name, definition }) => ({ id, name, definition }));
}

export function subclassSchema() {
  return SECURITY_SUBCLASSES.map(({ id, name, keywords }) => ({ id, name, keywords }));
}

/** Vertical assignments for one row. Empty -> general fallback. */
export function verticalOf(row) {
  const c = classifyByRule(row);
  if (!c.verticals.length) {
    return [{ id: 'general', confidence: 0, status: 'fallback', keyword: null, risk: RISK_LABEL }];
  }
  const byId = new Map(c.hits.map((h) => [h.vertical, h]));
  return c.verticals.map((id) => {
    const h = byId.get(id);
    return { id, confidence: h.confidence, status: h.status, keyword: h.keyword, risk: RISK_LABEL };
  });
}

/** Security subclasses only apply to rows carrying the `security` capability tag. */
export function subclassOf(row, meta) {
  let securityIdx;
  try { securityIdx = indexForSlug(meta, 'security'); } catch { return []; }
  if (!(row[ROW.TAGS] || []).includes(securityIdx)) return [];
  const text = `${keywordText(row)} ${row[ROW.DESCRIPTION] ?? ''}`.toLowerCase();
  const out = [];
  for (const sc of SECURITY_SUBCLASSES) {
    const hit = sc.keywords.find((k) => text.includes(k.toLowerCase()));
    if (hit) out.push({ id: sc.id, name: sc.name, keyword: hit, confidence: 0.7 });
  }
  return out;
}

function keywordText(row) {
  return String(row[ROW.ID] ?? '').split('/').pop().toLowerCase();
}

/** Capability x vertical cross-tab. `granularity:'fam'` (default) groups the
 *  50 capability tags into 14 families; `granularity:'tag'` returns all 50. */
export function capabilityVerticalRollup(rows, meta, opts = {}) {
  const { granularity = 'fam', top = 12 } = opts;
  const famOf = (i) => meta.tags[i]?.fam ?? '?';
  const slugOf = (i) => meta.tags[i]?.id ?? '?';
  const capCounts = new Map();
  for (const r of rows) for (const t of (r[ROW.TAGS] || [])) {
    const key = granularity === 'tag' ? slugOf(t) : famOf(t);
    capCounts.set(key, (capCounts.get(key) ?? 0) + 1);
  }
  const caps = granularity === 'tag'
    ? [...capCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k]) => k)
    : [...capCounts.keys()].sort((a, b) => capCounts.get(b) - capCounts.get(a));
  const verticalIds = VERTICALS.map((v) => v.id);
  const cells = caps.map(() => Object.fromEntries(verticalIds.map((v) => [v, 0])));
  const capIndex = new Map(caps.map((c, i) => [c, i]));
  for (const r of rows) {
    const vIds = new Set(verticalOf(r).map((v) => v.id));
    const seen = new Set();
    for (const t of (r[ROW.TAGS] || [])) {
      const cap = granularity === 'tag' ? slugOf(t) : famOf(t);
      const i = capIndex.get(cap);
      if (i === undefined || seen.has(i)) continue;
      seen.add(i);
      for (const v of vIds) cells[i][v]++;
    }
  }
  return { granularity, verticals: verticalIds, capabilities: caps, cells, note: '垂直标签由 keyword 规则派生，全部标注未校验/假阳性风险' };
}

/** Per-vertical rollup. A repo with multiple verticals contributes to each. */
export function verticalRollup(rows, meta) {
  const byVertical = new Map(VERTICALS.map((v) => [v.id, []]));
  for (const r of rows) for (const v of verticalOf(r)) {
    if (byVertical.has(v.id)) byVertical.get(v.id).push(r);
  }
  return VERTICALS.map((v) => {
    const list = byVertical.get(v.id);
    const s = stats(list);
    const capCounts = new Map();
    for (const r of list) for (const t of (r[ROW.TAGS] || [])) {
      const name = meta.tags[t]?.id ?? '?';
      capCounts.set(name, (capCounts.get(name) ?? 0) + 1);
    }
    const topCapabilities = [...capCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { id: v.id, name: v.name, ...s, topCapabilities, risk: RISK_LABEL };
  });
}

export function subclassRollup(rows, meta) {
  const bySub = new Map(SECURITY_SUBCLASSES.map((s) => [s.id, []]));
  let securityTagged = 0, unsegmented = 0;
  for (const r of rows) {
    const subs = subclassOf(r, meta);
    if ((r[ROW.TAGS] || []).includes(indexForSlug(meta, 'security'))) {
      securityTagged++;
      if (!subs.length) unsegmented++;
    }
    for (const s of subs) bySub.get(s.id)?.push(r);
  }
  return {
    securityTagged,
    unsegmented,
    subclasses: SECURITY_SUBCLASSES.map((s) => ({ id: s.id, name: s.name, n: bySub.get(s.id).length })),
  };
}

export function renderTaxonomy(rows, meta) {
  const roll = capabilityVerticalRollup(rows, meta);
  const vr = verticalRollup(rows, meta);
  const sub = subclassRollup(rows, meta);
  const lines = [
    '## TAXONOMY SCHEMA — capability × vertical (issue #16)',
    '',
    '> `vertical` 与现有 50 个 capability 标签**正交**、可多标签；`general` 是无垂直信号时的兜底桶。安全标签（capability `security`）可再挂二级 `subclass`。派生标签全部标注「未校验/假阳性风险」，见 issue #18。',
    '',
    'vertical 维度：',
    ...verticalSchema().map((v) => `  - \`${v.id}\` ${v.name} — ${v.definition}`),
    '',
    'security 二级 subclass：',
    ...subclassSchema().map((s) => `  - \`${s.id}\` ${s.name} — keywords: ${s.keywords.join(', ')}`),
    '',
    '## CAPABILITY × VERTICAL ROLLUP（按 capability family，机器可读全量见 `capabilityVerticalRollup(rows, meta, {granularity:"tag"})`）',
    '',
    '| capability family | ' + roll.verticals.join(' | ') + ' |',
    '|---|' + roll.verticals.map(() => '---|').join(''),
    ...roll.capabilities.map((cap, i) => `| ${cap} | ` + roll.verticals.map((v) => roll.cells[i][v]).join(' | ') + ' |'),
    '',
    '## VERTICAL ROLLUP（每仓可进多个 vertical，故各列仓数不可相加）',
    '',
    '| vertical | n | ★med | weekly med | weekly sum | +growth | new≤30d | top capabilities | risk |',
    '|---|---|---|---|---|---|---|---|---|',
    ...vr.map((v) => `| ${v.name} | ${v.n} | ${v.starsMedian ?? '-'} | ${v.weeklyMedian ?? '-'} | ${v.weeklySum} | ${v.growthPositive} | ${v.new30} | ${v.topCapabilities.map(([k, n]) => `${k}:${n}`).join(', ') || '-'} | ${v.risk} |`),
    '',
    `## SECURITY SUBCLASS ROLLUP — 安全标签仓 ${sub.securityTagged} 个，未细分 ${sub.unsegmented} 个`,
    '',
    ...sub.subclasses.map((s) => `  - ${s.name} (${s.id}): ${s.n}`),
  ];
  return lines.join('\n') + '\n';
}
