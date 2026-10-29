# DSH 市场插件审核库重做计划（Market Audit Library Redo Plan）

> 版本：v2.1（执行后回写，2026-10-29）  
> 范围：`dsh-plugin-eco-scan` v1 → v2（`eco-core` 数据层 + 插件壳）  
> 状态：M1–M5 全部完成；8 项验收中 3 项达成/基本达成、1 项部分达成、4 项未达或待测（生态覆盖率、映射准确率、有 token 全量耗时、分支覆盖率），校准等待连续两日数据  
> 仓库：`github.com/121212165/dsh-plugin-eco-scan`（`v0.2.0`，v1 冻结于 tag `v0.1.0`）  
> 本文既是计划，也是执行记录；所有“实测”数字来自 2026-10-29 的本机运行，可复现命令见 §9.4。

---

## 0. 摘要（先看这里）

- v1 是“每日 JSONL + 文本报告”的轻量扫描器；v2 把它重做成**可查询的 SQLite 生态情报库**：采集 → 映射 → 多标签分类 → 稳健评分 → 差异/导出/告警/面板/定时，全部收在 `src/core/`，插件只是薄壳，`eco-core` CLI 可脱离 dsh 运行。
- 152 个 `node --test` 全绿，`src/core` 行覆盖 97.7%；真实 GitHub + npm 扫描跑通（无 token、400 仓库、158s、94.6MB）。
- 结论：**v2 已达到可日常使用的水平**；剩余问题是“待测/待补数据”，不是已知缺陷。

验收记分板（目标 → 实测 → 判定）：

| 验收项 | 目标 | 实测 | 判定 |
|---|---|---|---|
| 生态覆盖率 | ≥ 95% | 无 token 的 REST 兜底拿不全 6 条语料查询，`corpusComplete=false` | **未达标**，待 token 复测 |
| 映射准确率 | ≥ 90% | 无人工 ground truth | **未验证** |
| 增长数据完整性 | ≥ 90% repo 有 npm/release 数据 | 400 仓库中 196 个有 npm 周下载（49%）；release 受 `--release-budget 5` 限制 | **部分达成** |
| 查询响应（10k 快照） | < 100ms | 6 条路径 4 条 < 100ms；`topRows` 108ms、`scoredSet` 110ms | 基本达成 |
| 全量扫描（有 token） | < 5min | 2106 仓库 422s（npm 批量修复前），修复后未复测 | **待复测** |
| 内存占用 | < 300MB | 进程峰值工作集 94.6MB | **达成** |
| 测试覆盖率 | ≥ 85% | 行 97.7% / 函数 93.6% / 分支 81.2% | 行、函数达成；**分支未达** |
| v1→v2 迁移 | 100% 成功 | 212 仓库 / 2634 条记录导入成功，幂等 | **达成** |

下一步三件事（按优先级）：① 用 token 重跑 GraphQL 全量，补覆盖率与耗时；② 抽样 ≥50 个仓库建立映射 ground truth，量化准确率；③ 连续两天扫描后重跑 `/eco-calibrate`。

---

## 1. 背景与问题（v1 现状）

### 1.1 v1 能力
- 数据源：GitHub topic 搜索（`dsh-plugin` / `dsh-plugins`）、npm 周下载、GitHub release 资产下载计数。
- 存储：`~/.dsh/eco-scan/snapshots-YYYY-MM.jsonl`，每月一个文件，同日覆盖，跨日差值即增长。
- 分类：9 个 segment 的正则 first-match（cost-budget、telemetry-analytics 等）。
- 评分：`score = growthPct * sqrt(latest)`，仅收正增长。
- 输出：文本报告（生态规模、赛道表、高增长 Top N、赛道增长中位）。
- 测试：12 个 `node --test`（纯函数层）+ `wire.test.ts`（装配层）。

### 1.2 v1 问题 → v2 处置（逐条可追溯）

| # | v1 问题 | v2 处置 | 证据 |
|---|---|---|---|
| 1 | npm↔repo 匹配启发式不可靠 | 优先级改为 人工 YAML → registry `repository` URL → awesome 索引 → 名称启发式；全部带 confidence 与来源，`mapping --unmatched` 可审计 | `src/core/mapping.ts`、`test/core/mapping.test.ts` |
| 2 | GitHub Search 1000 结果上限 | GraphQL 游标分页 + 6 条语料查询；REST search 兜底并按配额节流 | `src/core/collectors/github.ts` |
| 3 | Release 只取前 20 个 | 分页累加全部 asset，ETag 缓存，`releaseBudget` 控制刷新量 | `src/core/collectors/releases.ts` |
| 4 | JSONL 全量读入内存 | SQLite（WAL、外键、编号迁移、索引）；查询走 SQL | `src/core/db.ts`、`src/core/queries.ts` |
| 5 | 评分小基数虚高 | 贝叶斯平滑速度 + 四项加权 + cohort 内排名 + MAD 降权 + `insufficient` 剔除 | `src/core/scoring.ts` |
| 6 | 分类 first-match 不可解释 | 多标签（≤3）+ 置信度 `1−e^(−score)` + `segment_overrides` + 规则热更新 | `src/core/segmentation.ts` |
| 7 | 无告警/定时/导出 | 告警（3 类规则、同日去重、webhook）、内置调度器、5 种导出、单文件 HTML 面板、校准 | `alerts.ts` / `scheduler.ts` / `exporters.ts` / `panel.ts` / `calibrate.ts` |
| 8 | schema 无版本化 | `schema_migrations` 编号迁移；v1 数据自动导入且幂等 | `src/core/migrate.ts` |

---

## 2. 目标与非目标

### 2.1 目标
1. **可查询数据层**：SQLite 存储，SQL 聚合、索引、增量同步。
2. **可靠采集**：GraphQL 分页、ETag 条件请求、断点续扫、部分失败降级。
3. **准确映射**：多来源映射 + 置信度 + 未匹配清单。
4. **可解释分类**：多标签 + 置信度 + override。
5. **稳健评分**：平滑、cohort、多维指标、离群降权。
6. **数据产品**：JSON/JSONL/CSV/MD/HTML 导出、单文件面板、告警、定时。
7. **向后兼容**：v1 JSONL 可导入，`/eco-scan` 与 `eco_scan` 不变，v1 可回切。

### 2.2 非目标
- 不替代 `deep-scan`（GitHub 赛道深度扫描）；eco-scan 聚焦 dsh 插件生态。
- 不做付费/商业分析；不引入外部数据仓库（DuckDB/parquet 均未落地，见 §3.2）。

---

## 3. 架构（落地版）

### 3.1 代码布局
没有新建 `packages/` 工作区，核心库直接放在插件仓库内，通过 `./core` 子导出：

```
dsh-plugin-eco-scan/
├── src/core/                    # eco-core：纯数据层，可被 CLI/插件复用
│   ├── collectors/              # github.ts / npm.ts / releases.ts
│   ├── db.ts                    # node:sqlite 打开、WAL、编号迁移
│   ├── scan.ts                  # 扫描编排（检查点、阶段降级）
│   ├── mapping.ts / segmentation.ts
│   ├── scoring.ts / queries.ts / history.ts
│   ├── exporters.ts / panel.ts  # 报告与单文件 HTML
│   ├── alerts.ts / scheduler.ts / calibrate.ts
│   ├── migrate.ts               # v1 JSONL → v2
│   ├── defaults.ts              # 首次运行写规则/映射/告警 YAML
│   └── index.ts                 # 唯一对外出口
├── src/eco/                     # v1 采集/存储/评分（冻结，仅回切时使用）
├── src/v1.ts                    # 冻结的 v1 扫描器入口
├── src/plugin.ts                # 8 命令 + 3 工具的装配层
├── src/cli.ts                   # eco-core CLI（11 个子命令）
└── test/                        # test/core/*（128 个）+ v1 纯函数 + wire
```

### 3.2 依赖与运行环境
- 存储用 **Node 内置 `node:sqlite`**（`DatabaseSync`），无原生 addon，无 better-sqlite3/DuckDB 安装步骤；代价是 `engines.node >= 22.18`。
- 运行时依赖只有 `yaml`（规则/映射/告警文件）与 `@dsh-family/kit`（原子写）；`eco-core` 不依赖 dsh/cordis，CLI 可单独跑。
- 插件壳依赖 cordis + dsh-tools，`apply()` 只做注册与惰性打开 DB；命令/工具全部委托给 `src/core`。

### 3.3 数据目录（默认 `~/.dsh/eco-scan`）
```
eco.db                      SQLite（WAL）
exports/                    导出报告；panel.html 固定路径，每次覆盖
rules/segments.yml          赛道规则（按文件大小热更新）
mapping/repo-npm-map.yml    人工映射（最高优先级）
alerts/alerts.yml           告警规则
snapshots-YYYY-MM.jsonl     v1 历史（首次运行自动导入，保留为备份）
```

---

## 4. 数据模型（SQLite schema v2）

### 4.1 表清单（14 张，`schema_migrations` 为唯一版本真相）
| 表 | 作用 | 关键列 / 约束 |
|---|---|---|
| `repos` | 仓库基础信息 | `id`(owner/repo) PK；stars/forks/issues/topics/license；`ci`、`tests_count`、`issue_close_hours`、`details_fetched_at`、`archived` |
| `snapshots` | 每仓库每日一行 | `UNIQUE(repo_id, scan_date)`；stars、`npm_weekly`、`release_downloads`、主赛道 + 置信度 |
| `npm_packages` | npm 包观测 | `weekly_downloads`、`range_week`、`range_prev`、`growth_pct`（可空）、`fetched_at` |
| `repo_npm_map` | 映射 | 主键 `(repo_id, npm_name)`；`confidence`、`source ∈ {manual,awesome,registry,heuristic}` |
| `repo_segments` | 多标签 | 主键 `(repo_id, segment)`；`confidence`、`source ∈ {rules,override,legacy}` |
| `snapshot_segments` | 每期标签快照 | 主键 `(repo_id, scan_date, segment)` |
| `segment_overrides` | 人工改判 | `repo_id` PK + reason |
| `scans` | 每轮扫描 | `status ∈ {ok,partial,failed}`、`stage`、`checkpoint`、error |
| `scan_errors` | 分阶段错误 | 关联 `scans(id)` |
| `release_cache` | release 下载缓存 | `repo_id` PK、etag、fetched_at |
| `etag_cache` | 通用条件请求缓存 | `key` PK |
| `alert_events` | 告警去重 | `UNIQUE(rule_id, repo_id, scan_date)` |
| `meta` | 迁移标记等 | key/value |
| `schema_migrations` | 迁移记录 | version PK |

### 4.2 索引
`idx_snapshots_date`、`idx_snapshots_repo`、`idx_repo_segments_segment`、`idx_npm_weekly`、`idx_scan_errors_scan`。

### 4.3 存储与迁移
- 打开即 `PRAGMA journal_mode=WAL`、`synchronous=NORMAL`、外键开启；写操作用 `BEGIN IMMEDIATE` 事务。
- 迁移按版本号执行，`schema_migrations` 记录已应用版本；新库只跑一次，旧库自动补齐。

### 4.4 导出格式与 v1 兼容
- 实际支持 `json` / `jsonl` / `csv` / `md` / `html`（`parquet` 未实现，已从目标中移除）。
- `jsonl` 保留 v1 的 `SnapshotRecord` 字段，追加 `v: 2`、`segmentConfidence`、`npmRangeWeek`、`npmRangePrev`，导出全部快照。

---

## 5. 采集器（落地版）

### 5.1 GitHub
- **语料**：6 条 GraphQL 查询——`topic:dsh-plugin`、`topic:dsh-plugins`、`dsh-plugin in:name`、`dsh-plugins in:name`、`deepseek-harness`、`cordis plugin in:description`；游标分页、跨查询去重，`--max-repos` 上限与 `corpusComplete` 标记如实上报。
- **详情**：每 25 个仓库一次批量 GraphQL（CI、测试树、contributors、issue 中位关闭时长），细节按 `detailsTtlHours`（默认 6h）缓存。
- **限流**：优先 `GITHUB_TOKEN`/`GH_TOKEN`；无 token 走 REST search 兜底，按配额节流（无 token 约 10 次/分，响应头将尽时等到 reset）。
- **重试与熔断**：3 次指数退避（1s/2s/4s），尊重 `Retry-After`；`Retry-After` 超过退避上限直接失败；熔断按 **host** 计数（GitHub 熔断不影响 npm）。
- **断点续扫**：扫描检查点存 `scans.checkpoint`，`--resume` 从最近未完成阶段继续。

### 5.2 npm
- **发现**：`registry.npmjs.org/-/v1/search`（250/页）按关键词分页，顺带解析 `repository` URL 与周下载。
- **下载量**：无 scope 包走 `downloads/point/<周窗口>/a,b,c` 批量端点，本周/上周各 100 包一次请求；scope 包不能批量，改用 search 周下载 + 按下载量排序的 range 预算（默认 200 个）。
- **缺上周值**：预算外的 scope 包保留周下载、`prev=null`——增长率是显式 `null`，不是 0；评分标记 `insufficient`。

### 5.3 Releases
- `releases?per_page=100` 分页累加全部 asset 的 `download_count`，按 repo 存 ETag；缓存 TTL 默认 24h；`releaseBudget`（默认 250）限制单轮刷新仓库数。

### 5.4 可靠性
- 每个 collector 独立 try/catch：单阶段失败只降级该指标（`snapshots` 对应列 `null`），扫描状态标 `partial`，不中断整轮。
- 每个仓库采集完立即 upsert，崩溃后 `--resume` 可续。
- 失败按 host 熔断：连续 5 次后 60s 冷却，半开放单个探针。

---

## 6. 映射与分类

### 6.1 映射优先级
1. **manual**：`mapping/repo-npm-map.yml`，人工维护，最高优先级。
2. **registry**：npm 包 `package.json` 的 `repository` URL → repo，零猜测，confidence 1.0。
3. **awesome**：`awesome-dsh-plugin` README 行解析，confidence 0.95。
4. **heuristic**：名称前后缀/编辑距离，分档 0.3–0.7；`heuristicFloor` 过滤弱候选，并列时确定性裁决。
- 所有映射带 `source` 与 `confidence`；`eco-core mapping --unmatched` 列出未映射仓库（按 stars 排序），`/eco-health` 也报数量。

### 6.2 分类
- 规则文件 `rules/segments.yml`：关键词 + topic（每个 1.5）+ 名称正则（每个 2），乘赛道权重；得分经 `1−e^(−score)` 变为置信度。
- 多标签，默认最多 3 个；主赛道取最高分，未命中归 `other`（置信度 0）。
- `segment_overrides` 人工改判后，override 替换该仓库所有规则标签。
- 规则文件按大小热加载；YAML 写坏时保留上一版，不打断扫描。

---

## 7. 评分（落地版）

### 7.1 问题
v1 的 `growthPct * sqrt(size)` 让低基数插件虚高（如 2 → 20 下载即 +900%）。

### 7.2 公式（与 `src/core/scoring.ts` 一致）
- **velocity**：`g = (weekly − prev) / (prev + 20)`，`velocity = clamp(50 + 50·tanh(g), 0, 100)`。`prev=0` 有限不发散；`weekly` 或 `prev` 缺失、或 `prev < 5` 记 `insufficient`。
- **adoption**：`min(100, 100·log1p(npm周下载 + release下载) / log1p(5000))`。
- **quality**：CI 40 / 测试文件数 30 / issue 中位关闭时长 30（≤48h 满、≤7d 20、≤30d 10）；缺数据给中性分（15/10/15）。
- **maintenance**：`100·e^(−pushed距今天数 / 90)`。
- **综合分**：`0.4·velocity + 0.3·adoption + 0.2·quality + 0.1·maintenance`，权重和为 1（满分 100）。
- **cohort**：按「主赛道 × 仓库年龄（<30d / 30–90d / >90d）」组内排名。
- **离群**：MAD 3σ 之外分数 ×0.5。
- **数据不足**：`insufficient` 行分数减半且不进榜单，报告里显式标记。

---

## 8. 交互与输出

### 8.1 命令（8 个）
| 命令 | 说明 |
|---|---|
| `/eco-scan [--resume] [--skip-releases] [--segment <id>]` | 全量扫描；输出覆盖度、赛道表、评分 Top |
| `/eco-diff [toDate] [fromDate]` | 两次快照的 npm 周下载 / stars / release 下载差值 |
| `/eco-top [segment] [n]` | 赛道 Top N，带四个分项分与 `数据不足` 标记 |
| `/eco-export --format json\|jsonl\|csv\|md\|html [--date D] [--out]` | 导出报告，`--out` 写到 `<dataDir>/exports/` |
| `/eco-panel [--date D]` | 生成单文件 HTML 面板到固定路径 `exports/panel.html` |
| `/eco-calibrate [--from D] [--to D] [--k N]` | 样本外校准（Spearman + Top-K vs 基线） |
| `/eco-alerts [--dry-run] [--webhook URL]` | 评估告警，同日同仓库去重 |
| `/eco-health` | schema 版本、计数、最近扫描、近期错误、未映射数 |

### 8.2 工具（3 个，agent-facing）
- `eco_scan`：结构化 JSON（coverage / segments / top / errors）+ 文本卡片。
- `eco_diff`：两次扫描差异。
- `eco_query`：只读 SQL（仅 SELECT/WITH/EXPLAIN，表白名单 + 自动 LIMIT，拒绝多语句）。

### 8.3 CLI（不需要 dsh，11 个子命令）
`scan` · `diff` · `top` · `export` · `panel` · `calibrate` · `alerts` · `health` · `mapping --unmatched` · `migrate` · `sql`；全局参数 `--data-dir`、`--json`。

### 8.4 面板（单文件 HTML）
- 未采用 `dsh-web-app`/`useProjection`：改为**零依赖单文件**（内联 CSS + SVG，0 script / 0 link / 0 img），与 JSON 导出共用同一份 `buildExport` 数据管道，数字不可能漂移；双击即开，也能挂静态服务器。
- 三个区块：赛道 × 最近 12 快照热力图（`·` = 未观测，不是 0）、赛道表（与 `/eco-scan` 同源）、Top N 每行 12 点 sparkline（npm 周下载优先，全缺失退化 ★；null 是断点）。
- 路径固定 `exports/panel.html`，每次覆盖；定时轮次结束自动重画；带时间戳归档走 `/eco-export --format html --out`。

### 8.5 告警
- 规则文件 `alerts/alerts.yml`，内置 3 类：`growth-pct`（默认阈值 50%，minPrev 20）、`new-repo`（≤14 天）、`mapping-unmatched`（默认 >10）。
- 去重：`alert_events` 唯一键 `(rule_id, repo_id, scan_date)`，同日不重复发。
- 通道：webhook（`--webhook` 或 `alertsWebhook` 配置）；`--dry-run` 只评估不投递；投递失败记录但不抛出。

### 8.6 定时
- `schedule`（UTC）：`off`（默认）/ `every 6h` / `every 30m` / `daily 03:30`。
- 一轮 = 扫描 → 告警（去重）→ webhook → 重画面板；不重叠、失败不终止排程；`ctx.effect` 停表（stop 唤醒真实 timer）。
- `scheduleOnStart: true`（默认）时，启动发现当天无快照就补扫。

---

## 9. 测试与基准

### 9.1 单元测试（`test/core`，128 个）
- 采集器用**自定义 fake HttpClient**（未用 MSW/nock）：断言分页、ETag/304、重试与 `Retry-After`、按 host 熔断、批量下载、scope 预算、REST 兜底与配额节流。
- 存储：CRUD、唯一约束、事务回滚、只读连接拒写、迁移幂等、告警去重、健康统计。
- 映射：人工/registry/awesome/启发式优先级、置信度分档、模糊并列的确定性裁决、`heuristicFloor`。
- 评分与分类：平滑、cohort、MAD、`insufficient`、多标签上限、override、规则热更新。
- 查询：注释剥离、多语句拒绝、白名单、自动 LIMIT、截断标记。
- 说明：`fast-check` 属性测试**未采用**（已从计划中移除），以表驱动边界用例替代。

### 9.2 装配与迁移测试
- `wire.test.ts`：真实 `apply()` 挂载 **8 命令 + 3 工具**、mount 不触发网络/文件副作用、v1 回切、排程 effect 释放。
- v1 纯函数测试保留；迁移测试覆盖字段解析、v1→v2 往返、legacy 标签不覆盖 v2 多标签、空目录仍落标记。
- 全量：`npm test` 152 个用例全绿；`npm run check`（typecheck + 全量测试 + build）通过。

### 9.3 覆盖率与性能
- `npm run test:coverage`（仅 `src/core`）：行 97.74%、分支 81.22%、函数 93.60%；`calibrate`/`scheduler`/`history`/`migrate` 行 100%，`panel` 行 100%。
- 分支覆盖偏低的文件（后续补齐目标）：`scan.ts` 67.5%、`github.ts` 67.4%、`releases.ts` 72.2%、`panel.ts` 75.9%、`npm.ts` 76.2%、`queries.ts` 78.7%。
- 10k 快照基准（本机）：`eco_query` 7.5ms、`coverage` 9ms、`overview` 50ms、`diffRows` 87ms、`topRows` 108ms、`scoredSet` 110ms、JSONL 导出 79ms。后两项略超 100ms，属完整评分路径，非查询层回归。
- 性能基准为**人工运行**，未接入 CI 阈值（计划中的 CI gate 未实现，已从验收口径移除）。

### 9.4 校准与复现
- `/eco-calibrate`：对 T0/T1 都有周下载且 T0 有上周值的仓库，计算实际平滑增长与 T0 的 velocity/综合分做 Spearman 秩相关；基线「T0 周下载最大者赢」比 Top-K 命中；严格 point-in-time，只读两期快照，绝不用今天的 `npm_packages` 行补历史。
- 数据不足（<3 对）直接报「无法计算」，不输出假相关。
- 复现验收：
  ```sh
  npm install
  npm run check
  npm run test:coverage
  npx eco-core scan --max-repos 400 --release-budget 5
  npx eco-core panel
  ```

---

## 10. 迁移计划（v1 → v2，已执行）

### 10.1 实际路径
1. **冻结 v1**：打 tag `v0.1.0`；v1 代码保留在 `src/eco/` 与 `src/v1.ts`，`ecoVersion: 'v1'` 可挂回 legacy 扫描器（只注册 `/eco-scan` + `eco_scan`）。
2. **自动迁移**：v2 首次运行（`autoMigrate: true`，默认）导入所有 `snapshots-*.jsonl`，写 `meta` 标记；同日已有 v2 快照不覆盖；幂等，`--force` 才重导。
3. **不降级多标签**：legacy 标签只补 `repo_segments` 中不存在的仓库（该缺陷由面板热力图对账发现，已修复并有回归测试）。
4. **默认切流**：`ecoVersion` 默认 `v2`；v1 不删除，保留一个版本周期供回切。
5. **数据保留**：v1 JSONL 原样保留；`export --format jsonl` 同时输出 v1 字段与 v2 追加字段。

### 10.2 兼容性
- 命令 `/eco-scan`、工具 `eco_scan`、`dataDir` 不变；v2 在 `dataDir` 下建 `eco.db`。
- `eco_scan` 返回 JSON 新增字段、旧字段保留；`/eco-export` 新增 `jsonl`/`html` 格式。
- 真实 v1 历史导入验证：2634 条记录 / 212 仓库 / 4 个日期（09-29、09-30、10-02、10-17）。

---

## 11. 里程碑（计划 vs 实际）

| 里程碑 | 计划周期 | 实际完成 | 交付 |
|---|---|---|---|
| M1 基础 | 第 1–2 周 | 2026-10-29 | `src/core` 骨架、SQLite schema + 迁移、GitHub/npm 采集器、v1 迁移 |
| M2 映射与分类 | 第 3–4 周 | 2026-10-29 | 人工映射 YAML、registry/awesome 交叉验证、多标签引擎、override、热更新 |
| M3 评分与查询 | 第 5–6 周 | 2026-10-29 | 平滑 + cohort + 四项评分 + MAD、只读查询 API、diff/top/export |
| M4 输出与交互 | 第 7–8 周 | 2026-10-29 | 5 种导出、单文件面板、告警 + webhook、内置调度器 |
| M5 测试与切流 | 第 9–10 周 | 2026-10-29 | 152 用例、真实扫描、校准、默认 v2、README 与本文档 |

> 所有里程碑在 2026-10-29 单日完成（实现 + 验收），因此上表“计划周期”仅保留原始排期语义，不代表实际跨度。

### 11.1 执行偏差与决策记录
| 决策 | 计划 | 实际 | 理由 |
|---|---|---|---|
| 核心库位置 | 新建 `packages/eco-core` 工作区 | 仓库内 `src/core` + `./core` 子导出 | 单仓库发布更简单；CLI 可独立运行，复用不受影响 |
| SQLite 驱动 | better-sqlite3 | Node 内置 `node:sqlite` | 零原生依赖、零安装步骤；代价是 Node ≥ 22.18 |
| 面板 | `dsh-web-app` + `useProjection` | 零依赖单文件 HTML（无 script） | 与导出同源、可离线双击打开、无客户端版本耦合 |
| 命令面 | 6 命令 | 8 命令（+`/eco-panel` `/eco-calibrate`） | 面板与校准是验收闭环的一部分 |
| 测试工具 | MSW/nock + fast-check | 自定义 fake HttpClient + 表驱动 | 更贴近真实调用面，少一个依赖；属性测试收益不足 |
| v1 处置 | 切流后移除 | 冻结保留、可回切 | 保留一个周期，回滚成本低 |
| 导出格式 | 含 parquet | 仅 json/jsonl/csv/md/html | 无分析型下游，parquet 是过度设计 |
| 告警通道 | webhook + 本地通知 | webhook（dry-run + 去重） | 本地通知无稳定跨平台方案，暂缓 |
| CI 性能/覆盖率 gate | 入 CI | 人工基准 + 覆盖率报告 | 避免在 CI 上跑真实网络/噪声基准 |

---

## 12. 验收标准与实测

### 12.1 目标 vs 实测（2026-10-29）
| 指标 | 目标 | 实测 | 判定 |
|---|---|---|---|
| 生态覆盖率 | ≥ 95% | 无 token REST 兜底拿不全 6 条语料查询，400 仓库上限一轮里 `corpusComplete=false` | 未达标（待 token 复测） |
| 映射准确率 | ≥ 90% | 无人工 ground truth；209 条映射覆盖 205 个仓库，400 仓库中 195 个未匹配 | 未验证 |
| 增长数据完整性 | ≥ 90% | 400 仓库中 196 个有 npm 周下载；148 个包有下载数据（48 个 scope），其中 125 个有上周值 | 部分达成（release 仅刷新 5 个） |
| 查询响应（10k 快照） | < 100ms | `eco_query` 7.5 / `coverage` 9 / `overview` 50 / `diffRows` 87 / `topRows` 108 / `scoredSet` 110 ms | 基本达成 |
| 全量扫描时间 | < 5min（有 token） | 无 token、400 仓库 158s；有 token、2106 仓库 422s（npm 批量修复前），修复后未复测 | 待复测 |
| 内存占用 | < 300MB | 真实扫描峰值工作集 94.6MB | 达成 |
| 测试覆盖率 | ≥ 85% | 行 97.74% / 函数 93.60% / 分支 81.22% | 行、函数达成；分支未达 |
| v1→v2 迁移 | 100% | 2634 条 / 212 仓库 / 4 日期导入成功，幂等 | 达成 |

### 12.2 真实扫描与数据
- 无 token、`--max-repos 400 --release-budget 5`：400 仓库 / 209 条映射 / 148 个包有下载数据 / 196 个仓库有周下载；158s、峰值 94.6MB；状态 `partial`，9 条错误（GitHub 未认证配额 + npm 429）记录在 `scan_errors`。
- 合并 v1 历史后验收库：463 仓库 · 1155 快照 · 5 个日期；面板热力图最新列与赛道表逐段一致（framework-runtime 1,393,643 周下载）。
- v1 JSONL 现状（本次复核）：2 个文件、2634 条、212 个仓库、4 个日期、0 条损坏行。

### 12.3 面板验收（浏览器 DOM）
- `exports/panel.html`：0 script / 0 link / 0 img；8 赛道 × 5 日期 40 格热力图（20 格「未观测」）；Top 名次连续 1..20；sparkline 断点语义 `— → — → — → 459 → 292.4k`。

### 12.4 校准结论
- 默认窗口 10-17→10-29：不足 3 个双边可测仓库，诚实报「无法计算秩相关」。
- 唯一可行窗口 09-30→10-17：6 对，velocity 秩相关 −1，被单个异常仓库（552380→326，−99.9%）主导。
- **判定：暂不能下结论**，连续扫描两天后复测。

### 12.5 本轮修复的真实缺陷
1. 全局熔断计数器把 GitHub 失败算到 npm 头上 → 按 host 熔断。
2. REST 分页不受 `--max-repos` 约束 → 统一上限，且把 `corpusComplete` 如实置为 `false`（失败页不再谎报完整）。
3. search 里 1472 个 scope 映射按包逐个抓 → 429 熔断 → 改为 search 周下载 + range 预算。
4. `Retry-After` 超过退避上限仍提前重试 → 直接失败。
5. v1 迁移的 legacy 标签回填会覆盖 v2 多标签 → 只补缺失仓库（面板热力图对账时发现，有回归测试）。
6. 校准基线被 `scoredSet` 的 `npm_packages` 回填污染 → 只读两期快照观测值，杜绝伪造的「零变化」配对。

---

## 13. 风险与缓解（按实际技术栈更新）

| 风险 | 缓解 |
|---|---|
| GitHub 限流 / 覆盖率不足 | 强提示 token；REST 兜底按配额节流；分批 + ETag；`corpusComplete` 如实上报 |
| `node:sqlite` 依赖 Node ≥ 22.18 | `engines` 声明；README 明示；无原生 addon，CI 用 Node 25 验证 |
| npm 包名映射不准 | manual YAML + registry URL + awesome + 启发式 floor；`--unmatched` 审计 |
| 数据库损坏 | WAL + 事务；v1 JSONL 保留可重建；`schema_migrations` 可审计 |
| 评分校准样本不足 | 数据不足显式报错；要求连续两日快照；不输出假相关 |
| release 下载是生命周期累计、与周下载不同量纲 | 仅作规模代理，文档明示；不与周下载直接相加排名之外的用途 |
| 单文件面板在超大库上体积膨胀 | Top N + 12 快照窗口；完整数据走导出 |
| 分支覆盖率 81.2% 低于 85% | 已列薄弱文件，后续补齐（见 §14） |

---

## 14. 后续工作（按优先级）

1. **有 token 的 GraphQL 全量复测**：生态覆盖率、`corpusComplete`、耗时（目标 <5min）、内存；补 2106 仓库修复后的扫描记录。
2. **映射 ground truth**：抽样 ≥50 个仓库人工核对，量化准确率；把 195 个未匹配仓库中高热度的补进 `repo-npm-map.yml`。
3. **连续两日扫描 → 重跑 `/eco-calibrate`**：给出真实 Spearman 与 Top-K 命中，决定评分是否需要调参。
4. **分支覆盖 81.2% → ≥85%**：优先 `scan.ts`、`github.ts`、`releases.ts`、`panel.ts`、`npm.ts`、`queries.ts`。
5. **查询性能**：10k 快照下把 `topRows`/`scoredSet` 压到 <100ms（索引或预聚合）。
6. **运维**：自动备份 `eco.db`、告警通道扩展（如需本地通知）、文档站链接。

---

## 15. 参考

- 仓库内：`src/core/index.ts`（核心出口）、`src/plugin.ts`（装配）、`src/cli.ts`（CLI）、`src/eco/*`（冻结的 v1）、`test/core/*`（核心测试）、`test/wire.test.ts`（装配）
- 文档：`README.md`（v2 使用说明与验证状态）、本文档所在仓库的 `docs/market-audit-redo-plan.md`（同一份执行记录）
- 生态：`dsh-plugin-family/README.md`、`awesome-dsh-plugin`、`dsh-plugin-deep-scan`
- 历史：v1 `snapshots-*.jsonl`（`~/.dsh/eco-scan`）、tag `v0.1.0`

---

## 附录 A：v2.0 草案勘误（本次审核记录）

| # | v2.0 草案问题 | 修正 |
|---|---|---|
| 1 | §4 schema 写 better-sqlite3、缺 `repo_segments`/`snapshot_segments`/`scan_errors` 等表，索引 `idx_repos_segment ON repos(id)` 无意义 | 改为 14 张实际表 + 5 个真实索引；存储注明 `node:sqlite` |
| 2 | §4.1 声称支持 parquet 导出 | 移除；实际 5 种格式 |
| 3 | §5 采集器与实现不符（2 条语料 vs 6 条；`downloads/point/last-week` vs 批量周窗口 + scope 预算；release 前 20 vs 全量分页；全局熔断 vs 按 host） | 全部按实现重写 |
| 4 | §7 “Bayesian smoothing（先验 mean=0）”与实现（`(w−p)/(p+20)` + `tanh`）不一致；quality/maintenance 无细节 | 写成精确公式与分项阈值 |
| 5 | §8.1 命令表缺 `/eco-panel`、`/eco-calibrate`，导出格式缺 `jsonl`；§8.3 写 `dsh-web-app` 与单文件 HTML 冲突 | 命令表补全为 8 个；面板章节改写并说明理由 |
| 6 | §9.1 写 MSW/nock + fast-check，实际均未采用 | 改为 fake HttpClient + 表驱动，并显式标注未采用 |
| 7 | §9.3 把性能/覆盖率写成 CI 阈值，实际为人工基准 | 改为人工基准 + 覆盖率报告 |
| 8 | §11 用“第 X 周”描述已完成工作；“8 命令（+2）”算术错误 | 改为“计划 vs 实际”表；命令数修正为 8 |
| 9 | §12 覆盖率行把分支 81.2% 计为“达成” | 拆分行/函数/分支口径，分支判为未达 |
| 10 | §12.1 “209 条映射中 195 仓库未匹配”有歧义 | 明确为“209 条映射覆盖 205 个仓库，400 仓库中 195 个未匹配” |
| 11 | §13 风险仍写 better-sqlite3/DuckDB | 改为 `node:sqlite` 的 Node 版本约束与新风险 |
| 12 | §14 路径仍指向旧布局（`src/eco/*` 为 v1） | 更新为 `src/core/*` 与冻结的 v1 路径 |
