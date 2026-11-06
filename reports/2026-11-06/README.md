# dsh 插件生态扫描 · 2026-11-06

一次 `eco-core` 全量扫描的产物。打开 [index.html](index.html) 看可视化报告。

## 文件

| 文件 | 内容 |
|---|---|
| `index.html` | 自包含 HTML 报告：赛道分布、Top 200、增长榜、158 仓同口径趋势 |
| `potential.html` | 潜力指数榜单：909 个新兴候选 → 221 个可评分项目，含五项分解、公式与限制 |
| `potential.json` | 潜力榜单完整数据：原始指标、分项百分位、权重与过滤条件 |
| `report.md` / `report.json` | `eco-core export` 生成的标准报告（覆盖度、赛道表、Top 20、变化） |
| `top.json` | 综合评分 Top 200 的完整字段（分项分、cohort、stars、周下载、release） |
| `diff.json` | 2026-10-17 → 2026-11-06 的全部 1200 条差值（含 `from: null` 的新仓库） |
| `health.json` | 扫描健康状态：最近一次扫描、日期列表、错误 |

## 本次扫描

- 语料：GitHub 搜索 `topic:dsh-plugin`、`topic:dsh-plugins`、`dsh-plugin in:name`、`dsh-plugins in:name`、`deepseek-harness`、`cordis plugin in:description`
- 结果：**1200 个仓库**，566.6 秒；数据库累计 1215 个仓库、1955 条快照、5 个日期
- 覆盖：npm 映射 672（55.3%）、有周下载 556、有 release 数据 250
- 状态：`partial`（语料未穷尽）

### 是否跑全

所有阶段都跑完了（corpus → details → npm → releases → snapshot），但**语料没有穷尽**：

- 6 条查询在 GitHub 的 `total_count` 当前约为 **27,602 / 2,667 / 5,544 / 1,184 / 39,640 / 456**（查询之间有重叠，不能直接相加）
- 本次只收 **1,200 条**：GraphQL 返回 502 后回退 REST，REST 每条搜索最多 1,000 条；`maxRepos` 也是 1,200
- npm 侧 `api.npmjs.org` 触发 429 与熔断，1,215 个仓库里只有 556 个拿到周下载
- 因此这里的“全量扫描”指**全流程、全量落库**，不是“GitHub 上所有 dsh 仓库”

## 潜力指数

单独打开 [potential.html](potential.html)。它不复用综合评分，口径更偏“新项目动量”：

- **候选池 909**：有今日快照、未归档、非 awesome 清单、创建 ≤180 天、stars ≤20,000
- **可评分 221**：至少 2 个信号、权重覆盖 ≥45%，并且有 npm 信号或“星速 + 20 日惯性”
- **npm 只认已验证映射**：`repo_npm_map.confidence = 1`，避免一个包被几十个仓库共享导致的虚高
- **周环比做阻尼**：`(本周 − 上周) / (上周 + 200)`，小基数不会算出 +900%
- **权重**：动能 35% · 星速 25% · 牵引 20% · 惯性 10% · 新鲜 10%

Top 3：`saos-3624/dsh-video-storyboard` 96.4、`ccch1mneyyy/dsh-tui` 96.1、`liguobao/ds-harness-remote` 95.7。完整榜单见 HTML / JSON。

## 口径与限制

1. **语料是 partial**：GraphQL 端点返回 502，扫描自动回退到 REST；REST 搜索每条查询最多 1000 条并按 star 排序，本次收满 1200 条后停止。这不是“GitHub 上所有 dsh 仓库”。
2. **质量分普遍为 40**：CI、测试目录、贡献者数、issue 关闭时长只由 GraphQL 详情阶段采集；REST 回退下这些字段缺失。质量分不能用来判断工程质量。
3. **Top 榜是可测样本榜**：`api.npmjs.org` 触发 429 与熔断，只有 556 个仓库有周下载；评分要求本周与上周都有下载，缺数据的仓库被标为 `insufficient` 并从 Top 200 中剔除。
4. **历史口径不同**：9/10 月快照由 v1 JSONL 迁移而来，每天约 190 个仓库；今天 1200 个。跨日期比较仅取 158 个五天都在的 cohort，且只比较 star（v1 与 v2 的 npm 映射口径不同）。

## 复现

```sh
npx eco-core scan --json
npx eco-core top --limit 200 --json
npx eco-core diff --from 2026-10-17 --to 2026-11-06 --json
npx eco-core export --format md|json|html --out
```

数据目录默认 `~/.dsh/eco-scan`（`eco.db` 不随本目录发布）。
