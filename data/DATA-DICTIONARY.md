# ECO DATA 字段字典（唯一口径来源）

> 本文件是 `data/eco-data.json` 的**权威字段定义**。Agent 与报告禁止手写字段映射，只能引用本文件或机器可读的 `meta.columns`。生成器入口：`data/digest.mjs`（会在 digest 顶部打印列名表）。
>
> **维护约定**：第 1–4 节为第一批 #6（列定义）/ 第二批（富化字段）合入的列口径；第 5–7 节为第三批 #11（velocity）/ #14（heat / 下载语义）追加的语义段落。合并时已保留双方段落，不互相覆盖。

快照日期：`meta.date = 2026-11-16` ｜ 仓库数：38,549 ｜ 标签数：50

## 数据来源与快照

| 项 | 值 |
|---|---|
| 上游 | `eco-report-2026-11-06` / `index.html:165` `window.__DATA__` |
| 本库产物 | `data/eco-data.json`（`{meta, rows}`） |
| 快照日期 | `meta.date = 2026-11-16` |
| 规模 | 38,549 仓 / 50 标签 / 周下载合计 7,837,245 |

---

## 1. `rows[]` 逐列定义（18 列：14 核心列 + 4 富化列，位置数组）

| index | field | 含义 | 空值语义 / 注意事项 |
|---|---|---|---|
| 0 | `id` | `owner/repo` 全名 | 不会为 null |
| 1 | `score` | 综合分 = 四项百分位加权 + (1−coverage)×50 中性先验 | 不会为 null；`coverage=0` 时为 0 |
| 2 | `stars` | GitHub star 数 | 0 表示无 star，非 null |
| 3 | `weekly` | npm 最近一周下载量 | `null` = 未关联 npm 包或未取到下载数据（低信号来源之一） |
| 4 | `growthRawPct` | 原始环比增长百分比（未除 coverage） | `null` = 无可比快照 / 无增长信号 |
| 5 | `ageDays` | 仓库创建至今天数 | `null` = 未取到 `created_at` |
| 6 | `segIdx` | 主赛道数字下标（指向 `meta.segments` 数组） | 通常为整数 |
| 7 | `activity` | 活跃分（0–100） | 低分表示近期 push 弱；非 null |
| 8 | `archived` | 是否归档 0/1 | 非 null |
| 9 | `tags` | 能力标签**数字下标**数组（指向 `meta.tags`） | `[]` = 无能力标签；数字**不是** slug，见第 2 节 |
| 10 | `isEnriched` | 是否富化 0/1（README/npm 关键词补全能力标签，全库 174 仓） | 非 null。**不是 isMain**；旧简报此列写错过 |
| 11 | `coverage` | 信号覆盖率 = star 0.4 + 下载 0.3 + 增长 0.2 + 活跃 0.1 中已有项权重和 | 0 = 完全无信号；`coverage=1` 有 3,838 仓。**不是 isEnriched** |
| 12 | `lowSignal` | 低信号标志 0/1（`coverage < 0.5`） | 非 null；旧简报误记为 `x`/`y` 占位列 |
| 13 | `starVel` | star 增长速率（相邻快照 star 差） | **本快照全部 38,549 行均为 null**（无连续可比对快照）。是死列，但保留以维持位置兼容性；不要误当作有效指标 |
| 14 | `description` | 富化摘要文本（由能力标签名 + 主赛道 + score/coverage 生成），仅富化仓生成 | `null` = 非富化仓（`isEnriched=0`）或该快照无可生成摘要。摘要由真实标签数据派生，不是仓库名猜测 |
| 15 | `license` | 开源许可证 | `null` = **权威快照未提供**，需外部 GitHub API 补全；表示「未知」，不能解读为「无许可证」 |
| 16 | `latest_version` | 最新发布版本号 | `null` = **权威快照未提供**，需外部 GitHub/npm API 补全；表示「未知」，不能解读为「无发布」 |
| 17 | `owner` | 仓库归属者（`id` 中 `/` 之前的部分） | 通常非空；`id` 格式异常时为空串 |

历史坑：早期简报把 `row[10]` 写成 `isMain`、`row[11]` 写成 `isEnriched`、`row[12]`/`row[13]` 写成占位符。以本表为准。

富化字段（14–17）为第一批 #17 补齐：174 个 `isEnriched=1` 的仓库现在有可见摘要 + 标签，进入 `digest.md` 的 `## ENRICHED SAMPLES` 区。`license` / `latest_version` 在当前权威快照中恒为 `null`，仅保留字段位与明确的空值语义，待外部 API 补全后填充。

## 2. 两套标签 id 与转换方式

- `meta.tags[i].id` 是 **slug**（`rag` / `mcp` / `finance` / …）。
- `rows[].tags` 存的是 **数字下标**（8 / 13 / 47 / …），指向 `meta.tags`。
- `meta.tagIndex` 是权威映射：`{ slug: 数字下标 }`。转换必须用 `data/tag-index.mjs`：
  - `indexForSlug(meta, slug)` → 数字下标
  - `rowsForSlug(rows, meta, slug)` → 命中该 slug 的行
  - `assertSlugHits(rows, meta, slug)` → 命中行数，0 行时**抛错**（禁止静默空切片）
- 校验：`node data/validate.mjs` 会遍历全部 50 个 slug，确保每个转换后命中 ≥ 1 行。

## 3. 机器可读版本

`meta.columns` 是与本表一致的 JSON 数组（`{ index, field, meaning, nullSemantics }`）。`data/digest.mjs` 读取它并在 `digest.md` 的 `## COLUMN NAMES` 段打印；Agent 若需程序化取列名，读 `meta.columns`，不要复制本 Markdown 表格。

## 4. 评分与覆盖率口径（供解读，不作为字段映射）

- `coverage = (star>0 ? 0.4 : 0) + (weekly>0 ? 0.3 : 0) + (growth 有值 ? 0.2 : 0) + (pushDays 有值 ? 0.1 : 0)`
- `score = 四项百分位加权 + (1 − coverage) × 50`（缺项用中性先验 50 填补，不按 0 惩罚）
- `lowSignal = coverage < 0.5`（**字段 `row[12]` 的定义**）；榜单门禁阈值是 `coverage < 0.4`，两者不同，勿混用
- **榜单质量门禁（issue #19）**：主榜 / 推荐表先剔除 `row[8]=archived` 与 `row[11]=coverage<0.4`，再按 score 全局降序。门禁由 `data/quality-gate.mjs` 的 `passesQualityGate` / `mainBoard` 实现；`digest.md` 的 `## QUALITY GATE SELF-CHECK` 打印 `archived`、`lowSignal`、交集、排除合计、可入榜数，并断言「归档入榜=0、低信号入榜=0」。当前快照：归档 415、coverage<0.4 为 19,524、门禁排除 19,524+415−交集。
- Top60 榜单 = **全局 score 排序**（见 `digest.mjs` 的 `topByScore`），不再按 `r[10]===1 || r[2]>2000` 过滤；`topByScore` 保留为无门禁参照函数，实际发布的主榜是门禁后的 `mainBoard`

---

## 5. velocity（增长率 / 连续快照）语义 — #11

`velocity` 描述**同一批仓库在相邻快照之间的可比较变化**；当前位于 `meta.counts.velocity`（不是 `meta.velocity`）。

| 字段 | 当前值 | 含义 |
|---|---|---|
| `prevDate` | `null` | 上一期可比较快照日期；`null` = 没有上一期 |
| `days` | `null` | 两期间隔天数；`null` = 无法计算 |
| `overlap` | `0` | 两期都有有效观测的仓库数；`0` = 没有任何可比较仓库 |
| `note` | `数据积累中：可比较的快照仓库太少` | 官方给出的不可用原因 |

**判据（`scripts/check-snapshot-readiness.mjs`）**

- 可做趋势判断的必要条件：`prevDate != null` 且 `days > 0` 且 `overlap >= 2`（推荐 `>= 3` 期）。
- 不满足时报告**必须**写「不可做趋势判断」；所有 `growth` / 增长率数字只是单快照样本信号，不构成严格趋势结论。

**守恒语义**

- `overlap = 0` 时**不要**用今天的 `npm_packages` 回填历史——那会伪造大量「零变化」配对（`eco-calibrate` 已有回归测试钉死这条污染）。
- `weekly = null`：该仓无周下载观测，不是 0；`prev = 0` 走贝叶斯平滑 `(weekly − prev)/(prev + 20)`，不产生无穷大。
- `growth = null` / 缺失：记为 `insufficient`（评分减半且不进榜单），不是 0 增长。

**校准步骤（velocity 可用后）**

1. `node scripts/check-snapshot-readiness.mjs` 退出码 0。
2. `npx eco-core calibrate`（或 `/eco-calibrate`）：T0 排名能否预测 T0→T1 的真实变化（Spearman 秩相关 + Top-K 命中 vs 基线）。
3. 把窗口日期、双边可测仓库对数、秩相关、Top-K 命中写回 README「趋势与校准状态」表与本段。

**当前结论（2026-11-16）**：单快照，`velocity` 三项全空；`/eco-calibrate` 用 v1 稀疏历史仅 09-30→10-17 一个窗口凑够 6 对且被单仓（−99.9%）主导，记为「暂不能下结论」。需连续每日快照积累后才闭环。

---

## 6. heat（标签热度周序列）语义 — #14

`meta.heat` 是**标签 × 近 26 周**的周下载量序列，元素为 `{tag: <标签id>, total: <26周合计>, cells: [<每周值>...]}`，周日期由 `meta.weeks[]` 给出（当前 2026-05-18 ~ 2026-11-09）。

**覆盖缺口（不得静默缺席）**

- 当前 `meta.heat` 只有 **18/50** 个标签；另有 32 个未入选。
- 重点标签 **47 金融/行情、36 数据库、34 统计/监控、35 导出/归档** 未入选 heat；「不在 heat」表示未进入输出筛选，**不代表领域冷**（34 统计在 `meta.lanes` 中有 weeklySum）。
- 处理规则：要么输出全部 50 个标签，要么显式声明筛选阈值并列出全部未入选标签。本库采用前者，复算产物见 `data/reports/HEAT-AUDIT.md`（由 `data/heat.mjs` 生成）。

**结构性断点与采集起始周**

- `meta.weeks` 前 12 周（2026-05-18 ~ 2026-08-03）各标签合计仅占其 26 周总量的 0.23%–4.99%（例：tag18 网页界面 30/8642 = 0.35%）；第 13 周（2026-08-10）单周突跳（tag18 = 1,688）。
- 声明**采集起始周 = 2026-08-10**（`meta.weeks[12]`），对应「断点后第一周」。**真实起始日期仍需数据提供方确认**（遗留风险）；`data/heat.mjs --start-week YYYY-MM-DD` 可覆盖。
- 断点前的 `0` 视为**无数据**，不是真实 0；不得用它作为「热度回升倍数」的基期（那会把无数据当基线伪造高倍数，如 tag18 相对前 12 周均值 675x）。

**趋势计算判据（复算脚本 `data/heat.mjs`）**

1. 只使用断点后窗口 `meta.weeks[12..]`（当前 14 周）；不足 8 周输出「窗口不足」。
2. 以「近 4 周均值 ÷ 前 4 周均值」作为趋势；前 4 周为 0 时输出「基期为0(无数据)→不算倍数」。
3. 报告模板 `data/reports/_TEMPLATE.md` 强制写「采集起始周」和「趋势判断」两行；agent 不得复述断点前的 0 为真实 0。

---

## 7. 下载量（downloads）语义 — #14

| 口径 | 字段/位置 | 含义与禁用规则 |
|---|---|---|
| npm 周下载 | `rows[3]=weekly`、`meta.downloadTop[].weekly`、`meta.heat.cells[]` | 一周窗口的 npm 下载；`null` = 无观测，**不是 0**；`weekly>0` 的仓仅 7,001/38,549（覆盖低，低信号仓需求可能被低估）。 |
| 上周下载 | 扫描器 `snapshots` 中 `npm_weekly` 前值 | 只在同一仓库相邻两期都有观测时存在；缺失时不伪造增长率。 |
| release 下载 | 扫描器 `release_downloads` / `adoption` | 生命周期累计值，与 npm 周下载**不同量纲**，仅作规模代理，不能与 `weekly` 直接相加或比较趋势。 |
| `meta.lanes[].weeklySum` | 赛道/标签维度的周下载合计 | 可用来给未入选 heat 的标签（如 34 统计）提供规模信号；不是周序列。 |
| `growth` / velocity | `rows[4]` / `meta.counts.velocity` | 见第 5 节 velocity 段；单快照时只作方向参考。 |

**统一禁用规则**：`null`/`—` 一律按「无数据」处理，不填 0；不同量纲不相加；报告必须带数据快照日期与来源，避免结果与快照对不上。
