# 数据字典（DATA DICTIONARY）

> **维护约定**：`rows[]` 字段列定义（列号 → 列含义）由第一批 #6 / 第二批维护；本文件当前只包含第三批 **#11（velocity）/ #14（heat / 下载语义）** 追加的语义段落。
> 前两批的列定义尚未合入本基线（c68851a）。合并时请**保留双方段落**、不要互相覆盖；列定义以届时合并后的本文件为准，agent 禁止自行解释字段口径（见 `data/AGENT_BRIEF.md`「字段字典引用规则」）。

## 数据来源与快照

| 项 | 值 |
|---|---|
| 上游 | `eco-report-2026-11-06` / `index.html:165` `window.__DATA__` |
| 本库产物 | `data/eco-data.json`（`{meta, rows}`） |
| 快照日期 | `meta.date = 2026-11-16` |
| 规模 | 38,549 仓 / 50 标签 / 周下载合计 7,837,245 |

---

## velocity（增长率 / 连续快照）语义 — #11

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
