# ECO DATA 字段字典（唯一口径来源）

> 本文件是 `data/eco-data.json` 中 `rows[]` 的**权威字段定义**。Agent 与报告禁止手写字段映射，只能引用本文件或机器可读的 `meta.columns`。生成器入口：`data/digest.mjs`（会在 digest 顶部打印列名表）。

快照日期：`meta.date = 2026-11-16` ｜ 仓库数：38,549 ｜ 标签数：50

## 1. `rows[]` 逐列定义（14 列，位置数组）

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

历史坑：早期简报把 `row[10]` 写成 `isMain`、`row[11]` 写成 `isEnriched`、`row[12]`/`row[13]` 写成占位符。以本表为准。

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
- `lowSignal = coverage < 0.5`；主榜 = 未归档且 `coverage ≥ 0.4`
- Top60 榜单 = **全局 score 排序**（见 `digest.mjs` 的 `topByScore`），不再按 `r[10]===1 || r[2]>2000` 过滤
