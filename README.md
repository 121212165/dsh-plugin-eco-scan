# dsh-plugin-eco-scan

> 🧩 **dsh 插件家族**（22 件）：总目录 **[dsh-plugin-family](https://github.com/121212165/dsh-plugin-family)** ｜ 明星插件：**[ide-hub](https://github.com/121212165/dsh-plugin-ide-hub)** 跨 IDE 统一管理 · **[task-forge](https://github.com/121212165/dsh-plugin-task-forge)** 跨窗口无损交接 · **[quota](https://github.com/121212165/dsh-plugin-quota)** 实时用量仪表


**EN** · v2 turns the daily-JSONL scanner into **eco-core**: a queryable SQLite intelligence store for the dsh plugin ecosystem. GitHub corpus → batched details → npm downloads → canonical repo↔package mapping → multi-label segmentation → robust scoring in cohorts → exports, alerts, a self-contained HTML panel, a built-in scheduler, out-of-sample calibration and read-only SQL. 152 `node --test` green (plus a wire test that mounts the real plugin); real GitHub + npm scans executed on this machine.

v2 把 v1 的「每天一个 JSONL + 名称启发式」重做成可查询的数据层。所有采集、存储、评分、导出都在 `eco-core` 库里，dsh 插件只是薄壳；同一套库也能用 `eco-core` CLI 在没有 dsh 的机器上跑（cron / CI）。

适合回答："哪个赛道在涨？哪些插件是真实增长而不是小基数抖动？某个包三年来的下载曲线？我下个插件该卡哪个位？"

同系列：[price-aware](https://github.com/121212165/dsh-plugin-price-aware) · [cost-ledger](https://github.com/121212165/dsh-plugin-cost-ledger) · [relay-quota](https://github.com/121212165/dsh-plugin-relay-quota) · [transcript](https://github.com/121212165/dsh-plugin-transcript) · [transcript-search](https://github.com/121212165/dsh-plugin-transcript-search) · [obsidian-push](https://github.com/121212165/dsh-plugin-obsidian-push) · [session-insights](https://github.com/121212165/dsh-plugin-session-insights)。

## 两个入口

### dsh 命令与工具

| 命令 | 作用 |
|---|---|
| `/eco-scan [--resume] [--skip-releases] [--segment <id>]` | 跑一次全量扫描，输出覆盖度、赛道表、综合评分 Top；`--segment` 只看某个赛道 |
| `/eco-diff [toDate] [fromDate]` | 两次快照的 npm 周下载 / stars / release 下载差值（省略参数＝最近两次） |
| `/eco-top [segment] [n]` | 赛道 Top N，带四个分项分与 `数据不足` 标记 |
| `/eco-export --format json\|jsonl\|csv\|md\|html [--date D] [--out]` | 导出报告；`--out` 写到 `<dataDir>/exports/` |
| `/eco-panel` | 生成自包含 HTML 面板到 `<dataDir>/exports/panel.html`（固定路径，每次覆盖） |
| `/eco-calibrate [--from D] [--to D] [--k N]` | 样本外校准：T0 的排名能否预测 T0→T1 的真实变化（Spearman 秩相关 + Top-K 命中 vs 基线） |
| `/eco-alerts [--dry-run] [--webhook URL]` | 评估告警规则（npm 激增 / 新仓库 / 映射缺口），同日同仓库只发一次 |
| `/eco-health` | schema 版本、仓库/快照/映射数量、最近一次扫描、近期错误、未映射仓库数 |

工具：`eco_scan`（返回 JSON，含 coverage/segments/top/errors）、`eco_diff`、`eco_query`（只读 SQL，白名单表 + 自动 LIMIT）。

### CLI（不需要 dsh）

```sh
npx eco-core scan [--resume] [--skip-releases] [--max-repos N] [--release-budget N]
npx eco-core diff [--from D] [--to D]
npx eco-core top [--segment S] [--limit N] [--date D]
npx eco-core export --format md|json|jsonl|csv|html [--date D] [--out]
npx eco-core panel [--date D] [--limit N]      # 写 <dataDir>/exports/panel.html
npx eco-core calibrate [--from D] [--to D] [--k N]
npx eco-core alerts [--dry-run] [--webhook URL]
npx eco-core health
npx eco-core mapping --unmatched
npx eco-core migrate [--from <v1-dir>] [--force]
npx eco-core sql "SELECT ..." [--limit N]
```

全局参数：`--data-dir <dir>`、`--json`。数据目录默认 `~/.dsh/eco-scan`，布局：

```
eco.db                  SQLite（WAL）
exports/                导出报告
rules/segments.yml      赛道规则（可热更新）
mapping/repo-npm-map.yml 人工映射（最高优先级）
alerts/alerts.yml       告警规则
```

## 数据模型

`repos` · `snapshots`（每仓库每日一行）· `npm_packages` · `repo_npm_map` · `repo_segments`（多标签）· `snapshot_segments` · `segment_overrides` · `scans` · `scan_errors` · `release_cache` · `etag_cache` · `alert_events` · `meta` · `schema_migrations`。

`snapshots` 存 `stars / npm_weekly / release_downloads / segment / segment_confidence`；本周与上周下载同时落库，所以增长不需要第二次扫描。查询走索引，`eco_query` 只允许 SELECT/WITH/EXPLAIN，未知表直接拒绝。

## 评分口径

综合分 = `0.4 × velocity + 0.3 × adoption + 0.2 × quality + 0.1 × maintenance`。

- **velocity**：`(weekly − prev) / (prev + 20)` 做贝叶斯平滑后 `50 + 50·tanh(g)`。`prev = 0` 不会得到无穷大；`prev < 5` 或缺失记为 `数据不足`，分数打五折并从榜单剔除。
- **adoption**：`100·log1p(npm周下载 + release下载) / log1p(5000)`，封顶 100。
- **quality**：CI 40 分、测试文件数 30 分、issue 中位关闭时长 30 分（≤48h 满、≤7d 20、≤30d 10），缺数据给中性分。
- **maintenance**：`100·e^(−pushed距今天数 / 90)`。
- **cohort**：按「赛道 × 仓库年龄（<30d / 30–90d / >90d）」分组排名；组内 MAD 3σ 之外的分数 ×0.5，避免单点爆量霸榜。

## 采集与可靠性

- GitHub：GraphQL 游标分页（6 条语料查询：topic dsh-plugin(s)、name、deepseek-harness、cordis plugin in:description），限流时 REST search 兜底；每 25 个仓库一次批量细节查询（CI、测试树、contributor 数、issue 关闭时长），细节有 TTL 缓存。
- REST 兜底按 search 配额节流（有 token 2s/次≈30 次/分，无 token 6.5s/次≈10 次/分），响应头显示配额将尽时等到 reset；`--max-repos` 对 REST 同样生效。
- npm：registry `/-/v1/search` 发现包（顺带拿 repository URL 与**周下载**）；无 scope 的包走 `downloads/point/<周窗口>/a,b,c` 批量端点，两块窗口（本周/上周）每 100 个包各一次请求；scope 包（`@scope/name`）npm 拒绝批量查询，改用 search 的周下载 + 按周下载降序的 range 预算（默认 200 个），超出预算的包保留周下载但上周未知。
- Releases：分页求和，带 ETag；缓存 TTL 内不重复抓。
- 重试 1s/2s/4s（尊重 `Retry-After`）；`Retry-After` 超过退避上限时直接失败，不提前重试；熔断按 **host** 计（GitHub 熔断不会让 npm 看起来也死了），连续 5 次失败后 60s 冷却、半开放单个探针；每个仓库快照即时落库，`--resume` 从检查点续扫；单阶段失败只降级该指标（扫描状态标 `partial`），不会整轮报废。
- 「上周未知」不等于 0：缺 prev 的包 `growthPct` 为 `null`，评分为 `insufficient`（减半且不进榜单），而不是伪造一个增长率。

## 映射（repo ↔ npm）

优先级：人工 YAML → registry repository URL（零猜测）→ awesome 列表 → 名称启发式。结果带来源与置信度；`eco-core mapping --unmatched` 列出没映射上的仓库，`/eco-health` 也报数量。

## 分类

赛道规则 YAML 多标签：关键词命中 + topic（1.5/个）+ 名称正则（2/个），乘赛道权重；置信度 `1 − e^(−score)`。仓库可同时属于多个赛道，主赛道取最高分（`other` 兜底）。规则文件按大小热加载，YAML 写坏时保留上一版；`segment_overrides` 表可人工改判。

## 面板

`/eco-panel`（或 `eco-core panel`）写出一个**单文件 HTML**：内联 CSS + 内联 SVG，零 `<script>`、零 `<link>`、零外链资源，双击就能开，也可以挂到任何静态服务器。三个区块：

- **赛道热度热力图**：赛道 × 最近 12 次快照，颜色深浅 = 当次周下载；「·」表示当天没观测（不是 0）。
- **赛道表**：仓库数 / stars / 周下载 / 中位 ★（与 `/eco-scan` 报告同一份数据）。
- **综合评分 Top**：每行一条 12 快照 sparkline（优先 npm 周下载，全缺失时退化为 ★）；null 是断点不是 0，只有 1 个观测的仓库诚实显示「—」。

路径固定为 `<dataDir>/exports/panel.html`，每次重新生成覆盖；定时扫描跑完也会自动重画，所以收藏夹里的链接永远指向最新一期。另有带时间戳的 `eco-<date>-<time>.html` 归档走 `/eco-export --format html --out`。

## 定时扫描

`schedule` 配置内置调度器（UTC 口径）：`off`（默认）/ `every 6h` / `every 30m` / `daily 03:30`。到点依次执行 扫描 → 告警（同日去重）→ webhook → 重画面板；上一轮没跑完不会叠加下一轮；失败只记录不终止排程；dsh 卸载插件时通过 `ctx.effect` 停表。`scheduleOnStart: true`（默认）时，启动发现今天还没有快照就立即补扫一次。不想要内置调度就把 `schedule` 留在 `off`，用系统 cron 调 `eco-core scan`。

## 校准（评分到底有没有用）

`/eco-calibrate` 回答一个可证伪的问题：**T0 时刻的排名，能否预测 T0→T1 的真实变化？**

- 对每个两期都有周下载、且 T0 有上周值的仓库计算实际平滑增长 `(w1 − w0)/(w0 + 20)`，与 T0 的 velocity、综合分分别做 **Spearman 秩相关**（并列取平均秩），再和基线「T0 周下载最大的赢」比 **Top-K 命中**。
- 严格 point-in-time：基线只读 T0/T1 快照里的观测值，**绝不**用今天的 `npm_packages` 行补历史——补了会伪造大量「零变化」配对（这条污染在上线前被测试钉死）。
- 数据不够就明说：不足 3 个双边可测仓库时直接报原因，不输出假相关。校准需要**连续两天的快照**；v1 的历史（09-29/09-30/10-02/10-17）日期稀疏，只有 09-30→10-17 一个窗口凑够 6 对，且被单个异常仓库主导（velocity 第 1 名实际 −99.9%，秩相关 −1）——这是真实测得的「暂不能下结论」，不是缺陷；连扫两天后 `/eco-calibrate` 才有统计意义。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 关闭后不挂载任何命令/工具 |
| `dataDir` | `~/.dsh/eco-scan` | 与 v1 相同，v2 在其下建 `eco.db` |
| `tokenEnv` | `[GITHUB_TOKEN, GH_TOKEN]` | 无 token 走 REST，限流 60 次/小时 |
| `topGrowth` | `15` | 榜单行数 |
| `ecoVersion` | `v2` | `v1` 仅挂 legacy 扫描器 |
| `autoMigrate` | `true` | 首次运行导入 v1 `snapshots-*.jsonl` |
| `resume` | `false` | 默认从检查点续扫 |
| `releaseBudget` | `250` | 每次最多刷新多少个仓库的 release |
| `detailsTtlHours` | `6` | 仓库细节缓存 |
| `releaseTtlHours` | `24` | release 缓存 |
| `alertsWebhook` | — | `/eco-alerts` 默认投递地址 |
| `schedule` | `off` | 内置定时：`every 6h` / `every 30m` / `daily 03:30`（UTC）；`off` 交给系统 cron |
| `scheduleAlerts` | `true` | 定时轮次里连带评估告警 + webhook |
| `scheduleOnStart` | `true` | 挂载时今天还没有快照就先补扫一次 |

## 安装

三步，实测于 `@deepseek-ai/dsh@0.1.7-alpha.1`（需 `pnpm` 在 PATH 上）：

```sh
# ① 装进 profile：dsh plugin 把参数原样转发给 pnpm，git 包会自动跑 prepare 构建 lib/
dsh plugin --profile web add github:121212165/dsh-plugin-eco-scan
```

② 把本仓库根目录 `cordis.patch.yml` 的内容**并进** `$DSH_HOME/profiles/web/cordis.patch.yml`。
该文件默认是 `[]`，所以要么整份替换，要么把 insert 条目并进同一个数组；**不要直接追加**——
追加会形成两个 YAML 文档，启动即报
`failed to parse overlay ... end of the stream or a document separator expected`（本机实测踩过）。

③ 重启 dsh。配置层与 client 半都要重启才生效（客户端按 boot 时算出的内容 rev 下发，硬刷新浏览器没用）。

自检挂载：`dsh --profile web --dump-config | grep dsh-plugin-eco-scan`，应看到该条目。

## v1 兼容

- 命令名 `/eco-scan`、工具名 `eco_scan`、`dataDir` 全部不变。
- 首次 v2 运行自动导入 v1 的 `snapshots-*.jsonl`（同日已有 v2 快照时不覆盖）；迁移幂等，`--force` 才会重导。
- `ecoVersion: 'v1'` 仍可挂回冻结的 legacy 扫描器。
- `eco-core export --format jsonl` 同时写 v1 字段与 v2 追加字段（`segmentConfidence`、`npmRangeWeek`、`npmRangePrev`）。

## 验证状态

- `npm run check`（typecheck + 全量测试 + 构建）全绿；152 个 `node --test` 用例覆盖采集器（分页/ETag/重试/按 host 熔断/批量下载/scope 预算）、映射、分类、评分、迁移、查询白名单、导出、告警、面板/热力图/sparkline、调度器（含停表唤醒）、样本外校准，另有一个用真实 `apply()` 挂载 8 命令 + 3 工具的 wire 测试。
- 覆盖率（`npm run test:coverage`，仅 `src/core`）：行 97.7%、分支 81.2%、函数 93.6%；新模块 calibrate/scheduler/history/migrate 行覆盖 100%，panel 100%。
- 真实扫描（2026-10-29，无 token 的 REST 兜底，`--max-repos 400 --release-budget 5`）：400 仓库 / 209 条映射 / 148 个包有下载数据（其中 48 个 scope 包）/ 196 个仓库有周下载；耗时 158s，进程峰值工作集 94.6MB；状态 `partial`，9 条错误（GitHub 未认证配额 + npm 429），全部记录在 `scan_errors`。
- 合并 v1 历史（2634 条 v1 记录 / 212 仓库 / 4 个日期）后：463 仓库 · 1155 快照 · 5 个日期；迁移**不会**降级 v2 已写的多标签（legacy 标签只补 `repo_segments` 里没有的仓库，有回归测试）。面板热力图最新一列与赛道表逐段核对一致（framework-runtime 1,393,643 周下载双列同源）。
- 真实校准（同上数据集）：默认窗口 10-17→10-29 不足 3 个双边可测仓库，明确报「无法计算秩相关」；09-30→10-17 是唯一凑够对的窗口（6 对），velocity 秩相关 −1，被单个异常仓库（552380→326，−99.9%）主导——记录为「暂不能下结论」，待连续两天的扫描。
- 面板在真实浏览器 DOM 验收：0 script / 0 link / 0 img，8 赛道 × 5 日期热力格，sparkline 断点语义正确（`— → — → — → 459 → 292.4k`）。
- 10k 快照基准（同机）：`scoredSet` 110ms、`topRows` 108ms、`diffRows` 87ms、`overview` 50ms、`coverage` 9ms、`eco_query` 7.5ms、JSONL 导出 79ms；`/eco-query` 路径远低于 100ms，完整评分路径略高于 100ms。
- 覆盖度与映射准确度仍取决于 token、语料规模与人工映射表：未认证 REST 每次 search 只有 10 次/分，拿不全 6 条语料查询；有 token 的 GraphQL 路径才能接近覆盖率目标。
- scope 包的上周值受 range 预算限制（默认 200 个，按周下载降序），预算外的包只有周下载、无增长率——这是显式的 `null`，不是 0。
- quality 的 issue 维度用「中位关闭时长」代理，非真实缺陷密度；release 下载是生命周期累计值，与 npm 周下载不同量纲，仅作规模代理。

## 设计与执行记录

v2 的重做计划、决策记录与验收记分板见 [docs/market-audit-redo-plan.md](docs/market-audit-redo-plan.md)：为什么从 JSONL 迁到 SQLite、为什么用 `node:sqlite`、为什么面板是单文件 HTML、哪些验收项还没达标（分支覆盖率、有 token 的全量复测、映射 ground truth、校准样本），以及 v2.0 草案的逐条勘误。

