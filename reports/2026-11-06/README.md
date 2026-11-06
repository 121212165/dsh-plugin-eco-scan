# dsh 插件生态扫描 · 2026-11-06

一次 `eco-core` 全量扫描的产物。打开 [index.html](index.html) 看可视化报告。

## 文件

| 文件 | 内容 |
|---|---|
| `index.html` | 自包含 HTML 报告：赛道分布、Top 200、增长榜、158 仓同口径趋势 |
| `report.md` / `report.json` | `eco-core export` 生成的标准报告（覆盖度、赛道表、Top 20、变化） |
| `top.json` | 综合评分 Top 200 的完整字段（分项分、cohort、stars、周下载、release） |
| `diff.json` | 2026-10-17 → 2026-11-06 的全部 1200 条差值（含 `from: null` 的新仓库） |
| `health.json` | 扫描健康状态：最近一次扫描、日期列表、错误 |

## 本次扫描

- 语料：GitHub 搜索 `topic:dsh-plugin`、`topic:dsh-plugins`、`dsh-plugin in:name`、`dsh-plugins in:name`、`deepseek-harness`、`cordis plugin in:description`
- 结果：**1200 个仓库**，566.6 秒；数据库累计 1215 个仓库、1955 条快照、5 个日期
- 覆盖：npm 映射 672（55.3%）、有周下载 556、有 release 数据 250
- 状态：`partial`（语料未穷尽）

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
