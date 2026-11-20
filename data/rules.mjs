/** Official keyword -> vertical assist-tagging rules — issue #18 / #16.
 *
 *  Matching is done on the REPOSITORY BASENAME only (never `owner/repo`),
 *  because the observed false positives included owner names (`songoao25/...`
 *  matching "song"). Short keywords match as substrings of the basename to
 *  catch genuine forms like `eduwork`, but every hit is subject to a hard
 *  exclusion list and is always labelled "未校验/假阳性风险".
 */
import { ROW } from './schema.mjs';

export const RISK_LABEL = '未校验/假阳性风险';

/** keyword -> { vertical, confidence }. Confidence is a rule prior, NOT a verdict. */
export const KEYWORD_RULES = [
  // education
  { keyword: 'education', vertical: 'education', confidence: 0.95 },
  { keyword: 'edu', vertical: 'education', confidence: 0.7 },
  { keyword: 'course', vertical: 'education', confidence: 0.75 },
  { keyword: 'student', vertical: 'education', confidence: 0.75 },
  { keyword: 'exam', vertical: 'education', confidence: 0.7 },
  { keyword: 'teach', vertical: 'education', confidence: 0.7 },
  { keyword: 'paper', vertical: 'education', confidence: 0.55 },
  { keyword: 'class', vertical: 'education', confidence: 0.5 },
  { keyword: 'sim', vertical: 'education', confidence: 0.4 },
  // healthcare
  { keyword: 'medical', vertical: 'healthcare', confidence: 0.9 },
  { keyword: 'health', vertical: 'healthcare', confidence: 0.8 },
  { keyword: 'clinic', vertical: 'healthcare', confidence: 0.85 },
  { keyword: 'patient', vertical: 'healthcare', confidence: 0.85 },
  { keyword: 'hl7', vertical: 'healthcare', confidence: 0.95 },
  { keyword: 'fhir', vertical: 'healthcare', confidence: 0.95 },
  { keyword: 'pharma', vertical: 'healthcare', confidence: 0.8 },
  { keyword: 'doctor', vertical: 'healthcare', confidence: 0.4 }, // tool metaphor by default
  { keyword: 'triage', vertical: 'healthcare', confidence: 0.4 }, // tool metaphor by default
  // finance
  { keyword: 'finance', vertical: 'finance', confidence: 0.9 },
  { keyword: 'stock', vertical: 'finance', confidence: 0.85 },
  { keyword: 'ticker', vertical: 'finance', confidence: 0.9 },
  { keyword: 'trading', vertical: 'finance', confidence: 0.85 },
  { keyword: 'fund', vertical: 'finance', confidence: 0.7 },
  { keyword: 'crypto', vertical: 'finance', confidence: 0.75 },
  // gov / compliance
  { keyword: 'government', vertical: 'gov', confidence: 0.9 },
  { keyword: 'gov', vertical: 'gov', confidence: 0.85 },
  { keyword: 'compliance', vertical: 'gov', confidence: 0.85 },
  { keyword: 'policy', vertical: 'gov', confidence: 0.7 },
  { keyword: 'legal', vertical: 'gov', confidence: 0.75 },
  { keyword: 'procurement', vertical: 'gov', confidence: 0.8 },
  { keyword: 'audit', vertical: 'gov', confidence: 0.65 },
  // content creation
  { keyword: 'writer', vertical: 'content', confidence: 0.85 },
  { keyword: 'novel', vertical: 'content', confidence: 0.9 },
  { keyword: 'blog', vertical: 'content', confidence: 0.85 },
  { keyword: 'article', vertical: 'content', confidence: 0.8 },
  { keyword: 'write', vertical: 'content', confidence: 0.7 },
  { keyword: 'song', vertical: 'content', confidence: 0.5 },
  { keyword: 'deck', vertical: 'content', confidence: 0.35 }, // skill collection, not content
  // e-commerce
  { keyword: 'ecommerce', vertical: 'ecommerce', confidence: 0.95 },
  { keyword: 'commerce', vertical: 'ecommerce', confidence: 0.9 },
  { keyword: 'taobao', vertical: 'ecommerce', confidence: 0.9 },
  { keyword: 'shop', vertical: 'ecommerce', confidence: 0.85 },
  { keyword: 'mall', vertical: 'ecommerce', confidence: 0.85 },
  { keyword: 'cart', vertical: 'ecommerce', confidence: 0.85 },
  { keyword: 'store', vertical: 'ecommerce', confidence: 0.7 },
];

/** Hard veto: if the basename contains `term`, the listed keyword hit is
 *  discarded as a known false-positive pattern. `reason` is kept for audit. */
export const EXCLUDE_TERMS = [
  { term: 'wallpaper', keyword: 'paper', reason: 'paper→wallpaper 116/213 假阳性' },
  { term: 'classic', keyword: 'class', reason: 'class→classic 23/38 假阳性' },
  { term: 'schedule', keyword: 'edu', reason: 'edu→schedule 55/86 假阳性（schedule 含 edu 子串）' },
  { term: 'simplify', keyword: 'sim', reason: 'sim→simplify 假阳性' },
  { term: 'simulator', keyword: 'sim', reason: 'sim→simulator 信息栏/模拟器假阳性' },
  { term: 'similar', keyword: 'sim', reason: 'sim→similar 假阳性' },
  { term: 'doctor', keyword: 'doctor', reason: '医疗域工具隐喻，非临床仓' },
  { term: 'triage', keyword: 'triage', reason: '医疗域工具隐喻（日志/诊断分诊），非临床仓' },
  { term: 'deck', keyword: 'deck', reason: 'deck=技能集，不是内容创作' },
  { term: 'bottom-info-bar', keyword: 'song', reason: '信息栏插件，非音乐创作' },
  { term: 'preset', keyword: 'doctor', reason: 'preset-doctor 是配置诊断工具' },
  { term: 'provider', keyword: 'doctor', reason: 'provider-doctor 是配置诊断工具' },
  { term: 'memory', keyword: 'doctor', reason: 'memory-doctor 是记忆维护工具' },
];

export function keywordBase(id) {
  return String(id ?? '').split('/').pop().toLowerCase();
}

export function classifyByRule(row) {
  const base = keywordBase(row[ROW.ID]);
  const hits = [];
  for (const rule of KEYWORD_RULES) {
    if (!base.includes(rule.keyword)) continue;
    const veto = EXCLUDE_TERMS.find((e) => e.keyword === rule.keyword && base.includes(e.term));
    hits.push({
      keyword: rule.keyword,
      vertical: rule.vertical,
      confidence: rule.confidence,
      status: veto ? 'excluded' : 'unverified',
      excludedBy: veto?.term ?? null,
      reason: veto?.reason ?? null,
      risk: RISK_LABEL,
    });
  }
  // dedupe by vertical, keep the strongest (non-excluded first, then confidence)
  const best = new Map();
  for (const h of hits) {
    const prev = best.get(h.vertical);
    if (!prev || (prev.status === 'excluded' && h.status !== 'excluded') ||
        (prev.status === h.status && h.confidence > prev.confidence)) best.set(h.vertical, h);
  }
  const verticals = [...best.values()].filter((h) => h.status !== 'excluded').map((h) => h.vertical);
  return {
    basename: base,
    hits,
    verticals,
    status: !hits.length ? 'no-hit' : (verticals.length ? 'unverified' : 'excluded'),
    risk: RISK_LABEL,
  };
}

/** Capability tag names that can corroborate a vertical. Note: `description`
 *  in this snapshot is derived from capability tag names (issue #17), so a
 *  "confirmation" only means capability-coherent — NOT raw-README semantic
 *  truth. This limitation is printed in the digest and documented in §10. */
export const CORROBORATING_TAGS = Object.freeze({
  education: ['文档/笔记', '知识库/RAG'],
  // No clinical capability tag exists; "诊断/自检" is a tool-metaphor tag and
  // must NOT corroborate a clinical vertical (issue #18).
  healthcare: [],
  finance: ['金融/行情'],
  gov: ['安全', '文档/笔记'],
  content: ['文档/笔记', '设计/排版', '图像/绘图'],
  ecommerce: ['插件市场', '搜索/检索'],
});

/** Semantic second pass over the issue #17 description. */
export function semanticVerify(row, meta, classification) {
  const description = row[ROW.DESCRIPTION];
  if (typeof description !== 'string' || !description.length) {
    return {
      status: 'unavailable',
      confidence: 0,
      evidence: [],
      note: '该仓无 description（仅 174 个富化仓有），无法做语义二次校验；命中维持未校验/假阳性风险',
    };
  }
  const tagNames = (row[ROW.TAGS] || []).map((i) => meta.tags[i]?.name).filter(Boolean);
  const evidence = [];
  let confidence = 0;
  for (const h of classification.hits) {
    if (h.status === 'excluded') continue;
    const names = CORROBORATING_TAGS[h.vertical] ?? [];
    const found = names.filter((n) => tagNames.includes(n) || description.includes(n));
    if (found.length) {
      evidence.push({ vertical: h.vertical, keyword: h.keyword, tags: found });
      confidence = Math.max(confidence, Math.min(0.95, h.confidence + 0.15));
    }
  }
  return {
    status: evidence.length ? 'capability-confirmed' : 'unconfirmed',
    confidence,
    evidence,
    note: 'description 为能力标签派生的摘要（非原始 README），"确认"仅表示 capability 一致，仍须标注未校验/假阳性风险',
  };
}

export function verifiedClassification(row, meta) {
  const c = classifyByRule(row);
  if (c.status === 'no-hit') return { ...c, finalStatus: 'no-hit', verification: { status: 'not-applicable', confidence: 0, evidence: [], note: '无关键词命中' } };
  const verification = semanticVerify(row, meta, c);
  const finalStatus = c.status === 'unverified' && verification.status === 'capability-confirmed' ? 'confirmed' : c.status;
  return { ...c, finalStatus, verification };
}

/** The five false-positive patterns called out in issue #18. */
export const REGRESSION_CASES = Object.freeze([
  { id: 'weilv-d/wallpaper-engine-dsh', keyword: 'paper', vertical: 'education', why: 'paper→wallpaper 116/213' },
  { id: 'loyalchiiina/dsh-schedule-calendar', keyword: 'edu', vertical: 'education', why: 'edu→schedule 55/86' },
  { id: 'classicxtx/dsh-plugin-ctf', keyword: 'class', vertical: 'education', why: 'class→classic 23/38' },
  { id: 'michengai/dsh-simplify', keyword: 'sim', vertical: 'education', why: 'sim→simplify' },
  { id: 'drscrewdriver/dsh-preset-doctor', keyword: 'doctor', vertical: 'healthcare', why: 'doctor=工具隐喻，非临床仓' },
]);

export function renderRuleRegression(rows) {
  const byId = new Map(rows.map((r) => [r[ROW.ID], r]));
  const lines = [
    '## KEYWORD REGRESSION — 5 known false positives (issue #18)',
    '',
    '| 案例 | 关键词 | 期望 | 实际 | 结论 |',
    '|---|---|---|---|---|',
  ];
  let pass = 0;
  for (const c of REGRESSION_CASES) {
    const r = byId.get(c.id);
    const classification = r ? classifyByRule(r) : null;
    const hit = classification?.hits.find((h) => h.keyword === c.keyword);
    const ok = Boolean(r && !classification.verticals.includes(c.vertical) && (!hit || hit.status === 'excluded'));
    if (ok) pass++;
    const actual = hit
      ? hit.status + (hit.excludedBy ? ` by ${hit.excludedBy}` : '')
      : 'no-hit（owner 名假阳性被 basename-only 匹配消除）';
    lines.push(`| ${c.id} | \`${c.keyword}\` | 排除（${c.why}） | ${actual} | ${ok ? 'PASS' : 'FAIL'} |`);
  }
  lines.push('', `${pass}/${REGRESSION_CASES.length} 通过（全部被排除或降级标注，未计入领域总量）。`);
  return lines.join('\n') + '\n';
}

export function renderKeywordHits(rows, meta) {
  const byVertical = new Map();
  const noDescription = rows.filter((r) => typeof r[ROW.DESCRIPTION] !== 'string').length;
  let unavailable = 0;
  for (const r of rows) {
    const c = verifiedClassification(r, meta);
    if (c.verification.status === 'unavailable') unavailable++;
    for (const h of c.hits) {
      const key = h.vertical;
      if (!byVertical.has(key)) byVertical.set(key, { all: 0, excluded: 0, unverified: 0, confirmed: 0 });
      const b = byVertical.get(key);
      b.all++;
      if (h.status === 'excluded') b.excluded++;
      else if (c.finalStatus === 'confirmed') b.confirmed++;
      else b.unverified++;
    }
  }
  const lines = [
    '## DOMAIN KEYWORD HITS — 未校验，不得当领域总量 (issue #18)',
    '',
    `> 所有数字都是 basename 关键词命中数，不是领域仓库总量；排除词表与语义二次校验后仍需标注「${RISK_LABEL}」。无 description 的仓=${noDescription.toLocaleString('en-US')}（其中 ${unavailable.toLocaleString('en-US')} 仓有关键词命中，语义校验不可用）。`,
    '',
    '| vertical | 关键词命中 | 排除(假阳性) | 未校验 | capability 一致性确认 |',
    '|---|---|---|---|---|',
  ];
  for (const [v, b] of [...byVertical.entries()].sort((a, z) => z[1].all - a[1].all)) {
    lines.push(`| ${v} | ${b.all} | ${b.excluded} | ${b.unverified} | ${b.confirmed} |`);
  }
  lines.push('', '语义二次校验基于 issue #17 的 `row[14]=description`，但它是能力标签派生摘要、非原始 README；确认仅代表 capability 一致。');
  return lines.join('\n') + '\n';
}

export function renderRules() {
  const lines = [
    '## KEYWORD TAGGING RULES (issue #18)',
    '',
    `> 辅助打标规则；所有命中一律标注「${RISK_LABEL}」，不得直接当领域总量。关键词只对仓库 basename 匹配（不匹配 owner），短词支持子串以覆盖 \`eduwork\` 等形态，但受排除词表硬 veto。`,
    '',
    '排除词表（term / 影响的 keyword / 原因）：',
    ...EXCLUDE_TERMS.map((e) => `  - \`${e.word ?? e.term}\` → \`${e.keyword}\`：${e.reason}`),
    '',
    `关键词规则共 ${KEYWORD_RULES.length} 条，覆盖 6 个 vertical；完整机器可读表见 \`data/rules.mjs\` 的 \`KEYWORD_RULES\`。`,
  ];
  return lines.join('\n') + '\n';
}
