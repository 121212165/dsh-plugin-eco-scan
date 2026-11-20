# 共享分析简报 — DSH 插件生态数据（快照 2026-11-16）

## 共享文档（绝对路径固定，读任何文件前先看这里）

> 下列路径以本 worktree 为基准写死，解决「RETRO 到底在 `data/` 还是 `data/reports/`」的路径不一致问题。
> 换 worktree 时只替换公共前缀 `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3`，其余不变；不要凭记忆猜路径。

| 文档 | 绝对路径 | 用途 |
|---|---|---|
| 复盘 RETRO | `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3\data\reports\RETRO.md` | 已发现的 7 条问题；领域扫描 B 段只写**此文之外**的新问题 |
| 加工摘要 digest | `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3\data\digest.md` | 每标签统计 / 族汇总 / Top60 / 矩阵 / 热度 / 下载榜 |
| digest 生成器 | `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3\data\digest.mjs` | 快照更新后重建 digest |
| 数据字典 | `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3\data\DATA-DICTIONARY.md` | 字段口径**唯一**来源（含 velocity / heat / 下载语义） |
| 原始快照 | `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3\data\eco-data.json` | `{meta, rows}`，38,549 仓 / 50 标签 |
| 报告模板 | `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3\data\reports\_TEMPLATE.md` | 报告元数据块（快照日期 / 来源 / 采集起始周 / 趋势判断） |
| 报告登记 | `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3\data\reports\MANIFEST.md` | 每份报告的 agent / 领域 / 日期 / 文件 |
| Runbook | `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3\data\runbook.md` | 两波流程与质量门禁 |
| 临时目录 scratch | `C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan-batch3\data\.scratch\` | 仅放临时脚本 / 中间产物，已被 `.gitignore` 忽略 |

## 字段字典引用规则

- 所有字段含义以 `data/DATA-DICTIONARY.md` 为**唯一**权威来源；agent **禁止手写字段映射、禁止各自解释数据口径**。
- 本 brief 不列逐列字段映射；列定义见数据字典第 1 节与 `meta.columns`，一旦冲突以数据字典为准。
- 历史教训：早期简报曾把富化标志与覆盖率两列读反（详见数据字典第 1 节），根因是各自解释列含义。
- `null` 不等于 `0`：`weekly=null` 无周下载观测；`velocity.prevDate=null / overlap=0` 为单快照、不可做趋势判断；heat 断点前的 `0` 为无数据。

## 数据来源
- 原始全量数据：`C:\Users\lenovo\AppData\Local\Temp\opencode\dsh-plugin-eco-scan\data\eco-data.json`（`window.__DATA__`，38,549 个仓库）
- 已加工摘要：`...\data\digest.md`（含每标签统计、族汇总、Top60、矩阵、热度、下载榜）
- 可用 Node 脚本自行深挖（`node -e` 或临时脚本）：`eco-data.json` 结构为 `{meta, rows}`。

## 行结构 rows[] — 唯一口径来源
**禁止手写字段映射。** 逐列字段名 / 含义 / 空值语义一律引用 `data/DATA-DICTIONARY.md`；机器可读版本见 `eco-data.json` 的 `meta.columns`，`data/digest.mjs` 会在 `digest.md` 顶部打印列名表（`## COLUMN NAMES`）。
- 标签 id 一律通过 `meta.tagIndex` / `data/tag-index.mjs` 转换（`meta.tags[].id` 是 slug，`rows[].tags` 是数字下标），禁止按 slug 直接查 `rows[].tags`。
- 任何字段口径疑问以数据字典为准，不要在简报或报告里重新列举列下标。

## 50 个能力标签（id: name [fam]）
媒体: 0视频/分镜 1图像/绘图 2语音/音频 3屏幕感知 4视觉/多模态
认知: 5记忆 6人格/陪伴 7上下文/压缩
知识: 8知识库/RAG 9搜索/检索 10文档/笔记
其他: 11精选清单 44娱乐/游戏 49其他
开发: 12浏览器 23自动化 24Shell/执行 25Git/提交 26编码/代码 27文件/目录 46诊断/自检
连接: 13MCP 14远程/隧道
平台: 15移动端 16社交/IM 40插件市场 41安装/管理 42通知/提醒 43生产力/办公 48插件合集
交互: 17终端TUI 18网页界面 19桌面客户端 20命令行 21会话管理 22工作区
编排: 28智能体 29工作流 30技能/Prompt
模型: 31模型接入 32路由/网关 33成本/额度
数据: 34统计/监控 35导出/归档 36数据库 47金融/行情
设计: 37设计/排版 38中文本地化
安全: 39安全
基础设施: 45框架/运行时

## 矩阵（parent × capability 交集仓库数 — 0 格是信息缺口/空白位）
parents: 智能体(28) 会话管理(21) 技能/Prompt(30) 工作区(22) 模型接入(31)
caps: 网页界面(18) 桌面客户端(19) 设计/排版(37) 安装/管理(41) 成本/额度(33) 记忆(5) MCP(13) 图像/绘图(1) 工作流(29) 插件市场(40) 统计/监控(34) 搜索/检索(9) 路由/网关(32) Git/提交(25) 框架/运行时(45) 安全(39)

## 关键全局数字
- 38,549 仓库；主榜 18,829；低信号 19,868；周下载总计 7,837,245
- 30 天内新建 14,695；90 天内 15,963；归档 415
- 覆盖率：cov=0.1 有 19,524 仓，cov=1 有 3,838；中位覆盖率低 → 大量仓库缺数据
- misc-only 3,425（8.9%），miscNoDesc 1,166 → 描述缺失导致无法分类
- reachCoveragePct 18.16%（主榜 37.02%）→ 触达/覆盖低
- velocity 数据积累中（无连续快照）

## 领域扫描（D1–Dn）契约

> 全局/家族分析之外的垂直领域任务，统一按本节执行，保证可复现、产物不丢、并发不冲突。

### 固定输入

1. `data/eco-data.json`（`{meta, rows}`，快照 2026-11-16）——结论必须来自这里的二次统计。
2. `data/digest.md` + `data/digest.mjs`——加工摘要与可复算生成器。
3. `data/DATA-DICTIONARY.md`——字段语义唯一来源；`null` / heat 断点语义按字典处理。
4. `data/reports/RETRO.md`——已记录的 7 条问题；B 段只写**此文之外**的新问题，不要重复。
5. `data/reports/_TEMPLATE.md`——报告元数据块。

### 输出路径与命名规范

- 每个领域 agent 只写自己的 `data/reports/domains/Dn.md`（`n = 1..N`，例 `D1.md`…`D5.md`），**不要写共享文件**；写完由编排者登记 `data/reports/MANIFEST.md` 后统一提交。
- 文件内一级标题：`# Dn 领域扫描：<领域名>`（例 `# D1 领域扫描：教育 / 学术领域需求分析 + 新问题发现`）。
- agent id 与文件名一致（`D1`、`D2`…）；临时脚本命名为 `data/.scratch/Dn-*.cjs`，只写 scratch，不散落到 `data/` 根。

### 必备 A/B 两段结构

- `## A. 领域需求分析`
  - `### A0. 一句话结论`（带具体数字）
  - `### A1. 需求现状（数字）`：领域仓库数 / 占比 / 周下载 / 有下载仓数 / 新仓占比，与全局对比
  - `### A2. 未满足点（能力缺口）`：按标签/矩阵给出缺口与证据数字
  - `### A3. 推荐开发清单`：必备表（插件设想 | 命中标签 | 需求证据(数字) | 目标用户 | 优先级 | 难度）
- `## B. 新问题发现（RETRO 之外）`
  - `### B1. …（工具缺陷 / 数据缺陷 / taxonomy 缺陷）` 逐条编号；每条写明现象、证据数字、建议。
  - 不要复述 RETRO 已有 7 条；确实相关时引用编号并说明**新增**了什么。

### 热度与趋势纪律

- 报告元数据块照 `data/reports/_TEMPLATE.md`：必须写「采集起始周」（heat 断点后第一周，当前 2026-08-10）与「趋势判断」。
- heat 断点前的 `0` = 无数据；趋势只用断点后窗口（复算用 `data/heat.mjs`）。
- `velocity` 三项全空时标记「不可做趋势判断」，不要把单快照增长写成严格结论。

## 你的任务要求
1. 用数据说话：任何结论必须引用具体数字/仓库名/标签计数，不能空谈。
2. 用中文输出，结构化 Markdown。
3. 聚焦你的分工主题（见各自 prompt），输出**可执行的开发建议**（做什么插件、解决什么需求、目标用户、证据、优先级）。
4. 最后给出「推荐开发清单」表格：插件设想 | 命中标签 | 需求证据(数字) | 目标用户 | 优先级(高/中/低) | 难度(低/中/高)。
