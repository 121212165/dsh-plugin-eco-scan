/** Shipped defaults, written to the data directory on first use so operators
 * can edit them without reinstalling the plugin. Kept as YAML text (not JSON)
 * because the mapping/rules files are meant to be PR-able. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expandHome } from './util.js';
export const DEFAULT_RULES_YAML = `# eco-scan segmentation rules.
# score = keyword hits + 1.5 per topic + 2 per name pattern, all × weight.
# A repo can carry several segments; confidence = 1 - exp(-score).
segments:
  - id: cost-budget
    label: 成本与预算
    weight: 1
    keywords: [price, pricing, cost, budget, billing, quota, ledger, spend, money, token-cost, 费用, 预算, 额度, 账单]
    topics: [billing, cost, quota]
    namePatterns: ['(^|-)cost(-|$)', '(^|-)price', 'budget', 'quota', 'ledger']
  - id: telemetry-analytics
    label: 遥测与分析
    weight: 1
    keywords: [telemetry, metrics, insights, analytics, monitor, observability, dashboard, stats, 遥测, 统计, 分析, 监控]
    topics: [telemetry, analytics, observability]
    namePatterns: ['telemetry', 'insight', 'metric', 'trace', 'stat']
  - id: memory-context
    label: 记忆与上下文
    weight: 1
    keywords: [memory, memo, remember, recall, context, compaction, cache, 记忆, 上下文, 缓存]
    topics: [memory, context]
    namePatterns: ['memory', 'memo', 'context', 'cache']
  - id: ui-client
    label: UI 与客户端
    weight: 1
    keywords: [dashboard, panel, theme, ui, client, desktop, web, frontend, 界面, 面板, 客户端]
    topics: [ui, web, dashboard]
    namePatterns: ['(^|-)ui(-|$)', 'panel', 'desktop', 'web', 'theme']
  - id: archive-export
    label: 归档与导出
    weight: 1
    keywords: [archive, export, transcript, backup, history, snapshot, report, 归档, 导出, 转录, 报告]
    topics: [archive, export]
    namePatterns: ['archive', 'export', 'transcript', 'report', 'snapshot']
  - id: search-knowledge
    label: 搜索与知识
    weight: 1
    keywords: [search, vault, knowledge, index, wiki, notes, obsidian, rag, 检索, 搜索, 知识, 笔记]
    topics: [search, knowledge]
    namePatterns: ['search', 'vault', 'wiki', 'knowledge', 'index']
  - id: tools-devx
    label: 工具与开发体验
    weight: 1
    keywords: [tool, tools, skill, linter, lint, git, terminal, shell, review, workflow, test, 工具, 开发, 工作流]
    topics: [tools, devx, cli]
    namePatterns: ['(^|-)tool', 'skill', 'lint', 'hub', 'forge', 'workflow']
  - id: framework-runtime
    label: 框架与运行时
    weight: 1
    keywords: [harness, runtime, framework, kit, sdk, bridge, adapter, proxy, gateway, protocol, 框架, 运行时, 适配器]
    topics: [framework, runtime, sdk]
    namePatterns: ['runtime', 'framework', 'bridge', 'adapter', 'gateway', 'harness']
`;
export const DEFAULT_MAPPING_YAML = `# Canonical repo -> npm mappings. Highest precedence in the resolver.
# Add entries as: - repo: owner/name
#                  npm: package-name        (or a list for monorepos)
# Registry package.json repository URLs and the awesome index are merged
# automatically; heuristics only fill what none of them cover.
[]
`;
export const DEFAULT_ALERTS_YAML = `# Alert rules. Every rule fires at most once per repo per scan date.
# types: growth-pct | new-repo | mapping-unmatched
rules:
  - id: npm-surge
    type: growth-pct
    threshold: 50
    minPrev: 20
  - id: fresh-repo
    type: new-repo
    maxAgeDays: 14
  - id: mapping-gap
    type: mapping-unmatched
    threshold: 10
`;
export function ecoPaths(dataDir) {
    const root = expandHome(dataDir ?? '~/.dsh/eco-scan');
    return {
        dataDir: root,
        dbPath: join(root, 'eco.db'),
        rulesPath: join(root, 'rules', 'segments.yml'),
        mappingPath: join(root, 'mapping', 'repo-npm-map.yml'),
        alertsPath: join(root, 'alerts', 'alerts.yml'),
        exportDir: join(root, 'exports'),
    };
}
/** Writes the default rules/mapping/alerts files if they do not exist yet.
 * Never overwrites: user edits win. */
export function ensureDefaultFiles(paths) {
    const created = [];
    const files = [
        [paths.rulesPath, DEFAULT_RULES_YAML],
        [paths.mappingPath, DEFAULT_MAPPING_YAML],
        [paths.alertsPath, DEFAULT_ALERTS_YAML],
    ];
    for (const [path, content] of files) {
        if (existsSync(path))
            continue;
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, 'utf8');
        created.push(path);
    }
    mkdirSync(paths.exportDir, { recursive: true });
    return { created };
}
//# sourceMappingURL=defaults.js.map