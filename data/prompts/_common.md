# Agent 通用 onboarding（所有 wave1 / wave2 / 领域扫描提示词必须原样引用本文件）

> 不要在本提示词之外重新解释数据口径。口径只有三个来源，且优先级如下：
> 1. [`data/DATA-DICTIONARY.md`](../DATA-DICTIONARY.md) —— 字段列定义与 velocity / heat / 下载语义的**唯一**口径来源。
> 2. [`data/AGENT_BRIEF.md`](../AGENT_BRIEF.md) —— 快照日期、标签表、矩阵、全局数字、输出契约。
> 3. [`data/digest.md`](../digest.md) —— 由 `data/digest.mjs` 从 `data/eco-data.json` 生成的加工摘要。

## 数据源与快照

- 机器可读数据：`data/eco-data.json`（`{meta, rows}`，快照日期见 `meta.date`，当前 2026-11-16）。
- 上游来源：`eco-report-2026-11-06` 仓库 `index.html:165` 的 `window.__DATA__`（3.2 MB）。
- 每份报告必须照 [`data/reports/_TEMPLATE.md`](../reports/_TEMPLATE.md) 写元数据块：数据快照日期 + 数据来源 + 采集起始周 + 趋势判断。

## 禁止事项（口径纪律）

- **禁止自行解释 `rows[]` 列含义**：一律引用数据字典；历史上 `row[10]/row[11]` 被读反（`row[10]=isEnriched` 174 仓，`row[11]=coverage` 其中 =1 有 3,838 仓），错误即源于各自解释。
- **禁止把 `null` 当 `0`**：`weekly=null` 是无周下载观测；`velocity.prevDate=null / overlap=0` 是单快照、不可做趋势判断；heat 断点前的 `0` 是无数据。
- **禁止把单快照增长率写成严格趋势结论**：须按 `DATA-DICTIONARY.md` 的「velocity」段标记局限。

## 暂存区约定

- 临时脚本 / 中间产物只能写 `data/.scratch/`（已被 `.gitignore` 忽略）；不要散落在 `data/` 根目录。
- 可复算的最终分析器放 `data/`（如 `data/digest.mjs`、`data/heat.mjs`）。
- 提交前确认 `git status --untracked-files=all` 无意外文件。

## 输出要求

- 用中文、结构化 Markdown。
- 任何结论必须引用具体数字 / 仓库名 / 标签计数，不能空谈。
- 必备章节与推荐表按对应 wave 模板（`data/prompts/wave1.md` / `wave2.md`）或领域扫描章节（`data/AGENT_BRIEF.md`）执行。
