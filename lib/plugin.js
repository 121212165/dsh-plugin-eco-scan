import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { fetchTopicRepos, fetchNpmWeekly, readTokenFromEnv } from './eco/sources.js';
import { segmentOf, segmentStats, renderSegments } from './eco/segment.js';
import { rankGrowth, renderGrowth, renderSegmentsGrowth, renderLiveGrowth, rankLiveGrowth } from './eco/growth.js';
import { fetchNpmRangeGrowth } from './eco/sources.js';
import { SnapshotStore } from './eco/snapshot.js';
export const name = 'eco-scan';
export const inject = ['commands', 'tools'];
export const Config = Schema.object({
    enabled: Schema.boolean().default(true),
    dataDir: Schema.string(),
    tokenEnv: Schema.array(Schema.string()).default(['GITHUB_TOKEN', 'GH_TOKEN']),
    topGrowth: Schema.natural().default(15),
});
const today = () => new Date().toISOString().slice(0, 10);
export async function runScan(store, token, topGrowth) {
    const rawRepos = await fetchTopicRepos({ token });
    if (!rawRepos.length)
        return '生态扫描失败：GitHub 搜索一个仓库都没返回（检查 token / 网络）。';
    const npm = await fetchNpmWeekly(undefined, { token: undefined });
    const npmGrowth = await fetchNpmRangeGrowth([...npm.keys()]);
    // match npm packages to repos by name similarity: dsh-plugin-<x> → repo <x> or ...-<x>
    const repos = rawRepos.map((raw) => {
        const short = raw.full_name.split('/')[1].toLowerCase();
        let npmWeekly;
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
        store.append(repo, segment, date);
    }
    const segments = segmentStats(repos);
    const series = store.series();
    const growth = rankGrowth(series, topGrowth);
    // live npm week-over-week growth, backfilled from the range API so day-one
    // scans already rank niches without waiting for snapshot deltas. Packages are
    // ranked directly; a repo match (name containment, stem >= 4 chars) tags the row.
    const liveRows = [];
    for (const [pkg, stat] of npmGrowth) {
        if (stat.growthPct === null || stat.growthPct <= 0)
            continue;
        const stem = pkg.replace(/^@[^/]+\//, '').replace(/^(create-)?dsh(-plugin)?-/, '');
        if (stem.length < 4)
            continue;
        const repoMatch = repos.find((repo) => {
            const short = repo.fullName.split('/')[1].toLowerCase().replace(/^dsh-plugin-/, '').replace(/^dsh-/, '');
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
    const lines = [];
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
export function apply(ctx, config) {
    const log = ctx.logger('eco-scan');
    if (!config.enabled)
        return void log.info('disabled by config');
    const store = new SnapshotStore(config.dataDir);
    const scan = () => runScan(store, readTokenFromEnv(config.tokenEnv), config.topGrowth);
    ctx.commands.register({
        name: 'eco-scan',
        description: '扫描 dsh 插件生态：细分赛道 + 高增长排行（写入每日快照，差值即增长）',
        handler: async () => ({ kind: 'success', text: await scan() }),
    });
    ctx.tools.register(defineTool({
        name: 'eco_scan',
        description: '扫描 dsh 插件生态市场：细分赛道统计、高增长插件排行。做市场调研、找赛道机会时用。',
        parameters: {},
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        presentCall: () => ({ card: 'generic', title: '生态扫描', kind: 'fetch' }),
        presentResult: (_args, value) => ({
            card: 'generic',
            title: String(value).split('\n')[0].slice(0, 60),
            kind: 'fetch',
            rawInput: value,
        }),
        async execute() {
            return scan();
        },
    }));
    log.info(`mounted · dataDir=${store.dataDir}`);
}
//# sourceMappingURL=plugin.js.map