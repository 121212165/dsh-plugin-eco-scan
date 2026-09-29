/** Market segmentation over dsh plugin repos. Keyword rules classify each repo
 * into one segment; rules are ordered, first match wins, and 'other' is the
 * explicit catch-all — an uncategorized repo is data, not an error. */

export interface EcoRepo {
  fullName: string;
  description: string;
  stars: number;
  createdAt: string;
  pushedAt: string;
  /** npm weekly downloads when the repo publishes a package we can find */
  npmWeekly?: number;
  /** release asset download counts summed */
  releaseDownloads?: number;
}

export type Segment =
  | 'cost-budget'
  | 'telemetry-analytics'
  | 'memory-context'
  | 'ui-client'
  | 'tools-devx'
  | 'search-knowledge'
  | 'archive-export'
  | 'framework-runtime'
  | 'other';

export const SEGMENT_LABEL: Record<Segment, string> = {
  'cost-budget': '成本与预算',
  'telemetry-analytics': '遥测与分析',
  'memory-context': '记忆与上下文',
  'ui-client': 'UI 与客户端',
  'tools-devx': '工具与开发体验',
  'search-knowledge': '搜索与知识',
  'archive-export': '归档与导出',
  'framework-runtime': '框架与运行时',
  other: '其他',
};

const RULES: [Segment, RegExp][] = [
  ['cost-budget', /price|cost|budget|billing|quota|ledger|spend|money|费用|预算|额度/i],
  ['telemetry-analytics', /telemetry|token|metrics|insight|stats|analytic|monitor|遥测|统计|分析/i],
  ['memory-context', /memory|memos|remember|context|recall|compaction|记忆|上下文/i],
  ['ui-client', /dashboard|panel|theme|ui|client|web|desktop|界面|面板|客户端/i],
  ['archive-export', /archive|export|transcript|backup|history|snapshot|归档|导出|转录/i],
  ['search-knowledge', /search|vault|knowledge|index|rdb|wiki|检索|搜索|知识/i],
  ['tools-devx', /tool|skill|linter|lint|git|terminal|shell|review|workflow|工具|开发/i],
  ['framework-runtime', /harness|runtime|framework|kit|sdk|bridge|adapter|proxy|gateway|框架|运行时/i],
];

export function segmentOf(repo: EcoRepo): Segment {
  const haystack = `${repo.fullName} ${repo.description}`;
  for (const [segment, rule] of RULES) {
    if (rule.test(haystack)) return segment;
  }
  return 'other';
}

export interface SegmentStat {
  segment: Segment;
  repos: number;
  stars: number;
  weeklyDownloads: number;
  medianStars: number;
}

export function segmentStats(repos: EcoRepo[]): SegmentStat[] {
  const groups = new Map<Segment, EcoRepo[]>();
  for (const repo of repos) {
    const segment = segmentOf(repo);
    const group = groups.get(segment);
    if (group) group.push(repo);
    else groups.set(segment, [repo]);
  }
  const stats: SegmentStat[] = [];
  for (const [segment, group] of groups) {
    const stars = group.map((repo) => repo.stars).sort((a, b) => a - b);
    stats.push({
      segment,
      repos: group.length,
      stars: group.reduce((total, repo) => total + repo.stars, 0),
      weeklyDownloads: group.reduce((total, repo) => total + (repo.npmWeekly ?? 0), 0),
      medianStars: stars.length % 2 ? stars[(stars.length - 1) >> 1]! : Math.round(((stars[stars.length >> 1] ?? 0) + (stars[(stars.length >> 1) - 1] ?? 0)) / 2),
    });
  }
  return stats.sort((a, b) => b.weeklyDownloads - a.weeklyDownloads || b.stars - a.stars);
}

export function renderSegments(stats: SegmentStat[]): string {
  const lines = stats.map((stat) =>
    `  ${SEGMENT_LABEL[stat.segment].padEnd(10)} ${SEGMENT_PAD(stat.segment)} ${String(stat.repos).padStart(4)} 个仓库 · ★${String(stat.stars).padStart(7)} · 周下载 ${String(stat.weeklyDownloads).padStart(7)} · 中位 ★${stat.medianStars}`,
  );
  return lines.join('\n');
}

function SEGMENT_PAD(segment: Segment): string {
  return segment.padEnd(20);
}
