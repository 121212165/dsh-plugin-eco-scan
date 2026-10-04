/**
 * dsh wiring for eco-scan. One scan = fetch ecosystem surfaces → append a
 * dated snapshot → render segments + growth ranking from ALL history. The
 * agent-facing tool lets the harness answer "哪个插件赛道在涨" by itself.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-commands';
import type {} from '@deepseek-ai/dsh-tools';

import { fetchTopicRepos, fetchNpmWeekly, readTokenFromEnv, type RawRepo } from './eco/sources.ts';
import { segmentOf, segmentStats, renderSegments, SEGMENT_LABEL, type EcoRepo, type Segment } from './eco/segment.ts';
import { rankGrowth, renderGrowth, renderSegmentsGrowth, renderLiveGrowth, rankLiveGrowth, type LiveGrowthRow } from './eco/growth.ts';
import { fetchNpmRangeGrowth } from './eco/sources.ts';
import { SnapshotStore } from './eco/snapshot.ts';

export const name = 'eco-scan';
export const inject = ['commands', 'tools'];

export interface Config {
  enabled: boolean;
  dataDir?: string;
  tokenEnv: string[];
  topGrowth: number;
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true),
  dataDir: Schema.string(),
  tokenEnv: Schema.array(Schema.string()).default(['GITHUB_TOKEN', 'GH_TOKEN']),
  topGrowth: Schema.natural().default(15),
});

const today = (): string => new Date().toISOString().slice(0, 10);

export async function runScan(store: SnapshotStore, token: string | undefined, topGrowth: number): Promise<string> {
  const rawRepos = await fetchTopicRepos({ token });
  if (!rawRepos.length) return '生态扫描失败：GitHub 搜索一个仓库都没返回（检查 token / 网络）。';

  const npm = await fetchNpmWeekly(undefined, { token: undefined });
  const npmGrowth = await fetchNpmRangeGrowth([...npm.keys()]);
  // match npm packages to repos by name similarity: dsh-plugin-<x> → repo <x> or ...-<x>
  const repos: EcoRepo[] = rawRepos.map((raw: RawRepo) => {
    const short = raw.full_name.split('/')[1]!.toLowerCase();
    let npmWeekly: number | undefined;
    for (const [pkg, count] of npm) {
      const pkgShort = pkg.replace(/^@[^/]+\//, '').replace(/^dsh-plugin-/, '').replace(/^dsh-/, '');
      if (short === pkgShort || short.endsWith(pkgShort) || pkgShort.endsWith(short.replace(/^dsh-plugin-/, ''))) {
        npmWeekly = Math.max(npmWeekly ?? 0, count);
      }
    }
    return {
      fullName: raw.full_name,
      description: raw.description ?? '',
      stars: raw.stargazers_count,
      createdAt: raw.created_at,
      pushedAt: raw.pushed_at,
      npmWeekly,
    };
  });

  const date = today();
  for (const repo of repos) {
    const segment = segmentOf(repo);
    store.append(repo, segment as Segment, date);
  }

  const segments = segmentStats(repos);
  const series = store.series();
  const growth = rankGrowth(series, topGrowth);

  // live npm week-over-week growth, backfilled from the range API so day-one
  // scans already rank niches without waiting for snapshot deltas. Packages are
  // ranked directly; a repo match (name containment, stem >= 4 chars) tags the row.

  const liveRows: LiveGrowthRow[] = [];
  for (const [pkg, stat] of npmGrowth) {
    if (stat.growthPct === null || stat.growthPct <= 0) continue;
    const stem = pkg.replace(/^@[^/]+\//, '').replace(/^(create-)?dsh(-plugin)?-/, '');
    if (stem.length < 4) continue;
    const repoMatch = repos.find((repo) => {
      const short = repo.fullName.split('/')[1]!.toLowerCase().replace(/^dsh-plugin-/, '').replace(/^dsh-/, '');
      return short.includes(stem) || stem.includes(short);
    });
    liveRows.push({
      fullName: repoMatch ? repoMatch.fullName : pkg,
      segment: repoMatch ? segmentOf(repoMatch) : 'other',
      week: stat.week,
      prev: stat.prev,
      growthPct: stat.growthPct,
      score: Math.max(0, stat.growthPct) * Math.sqrt(Math.max(1, stat.week)),
    });
  }
  const live = rankLiveGrowth(liveRows, topGrowth);

  const lines: string[] = [];
  lines.push(`dsh 插件生态快照 ${date}：${repos.length} 个仓库（topic: dsh-plugin / dsh-plugins）`);
  lines.push('');
  lines.push('细分赛道（按周下载+星标排序）:');
  lines.push(renderSegments(segments));
  lines.push('');
  lines.push(`npm 周环比高增长 Top ${live.length}（本周 vs 上周，速度×规模评分）:`);
  lines.push(renderLiveGrowth(live));
  lines.push('');
  lines.push(`快照差值高增长 Top ${growth.length}（跨日扫描后生效）:`);
  lines.push(renderGrowth(growth));
  lines.push('');
  lines.push('细分赛道增长中位（快照差值）:');
  lines.push(renderSegmentsGrowth(growth));
  lines.push('');
  lines.push(`快照已写入 ${store.dataDir}（每天扫一次，差值序列会越来越准）`);
  return lines.join('\n');
}

export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger('eco-scan');
  if (!config.enabled) return void log.info('disabled by config');
  const store = new SnapshotStore(config.dataDir);

  const scan = (): Promise<string> => runScan(store, readTokenFromEnv(config.tokenEnv), config.topGrowth);

  ctx.commands.register({
    name: 'eco-scan',
    description: '扫描 dsh 插件生态：细分赛道 + 高增长排行（写入每日快照，差值即增长）',
    handler: async () => ({ kind: 'success', text: await scan() }),
  });

  ctx.tools.register(
    defineTool({
      name: 'eco_scan',
      description: '扫描 dsh 插件生态市场：细分赛道统计、高增长插件排行。做市场调研、找赛道机会时用。',
      parameters: {},
      output: {
        schema: { type: 'string' } as const,
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      presentCall: () => ({ card: 'generic' as const, title: '生态扫描', kind: 'fetch' as const }),
      presentResult: (_args, value) => ({
        card: 'generic' as const,
        title: String(value).split('\n')[0]!.slice(0, 60),
        kind: 'fetch' as const,
        rawInput: value,
      }),
      async execute() {
        return scan();
      },
    }),
  );

  log.info(`mounted · dataDir=${store.dataDir}`);
}
