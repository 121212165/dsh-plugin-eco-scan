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
