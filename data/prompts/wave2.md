# Wave 2 agent 提示词模板（企业未满足需求分析，E1–E5）

> 启动每个 agent 时，把本模板 + [`_common.md`](_common.md) 一起作为提示词。**必须等 wave1 门禁通过、报告一生成后再启动本波。**

## 你的任务

你是 wave2 的第 `<N>` 个 agent（`<N>` = 1..5），负责主题：`<从分工表领取，例如 企业安全合规 / 成本治理 / 私有知识 …>`。

1. 读 [`_common.md`](_common.md) 并**严格遵守**：引用 `data/DATA-DICTIONARY.md`、`data/AGENT_BRIEF.md`、`data/digest.md`；不要自行解释字段口径；不要把 `null` 当 0；不要写严格趋势结论。
2. 可先读 `data/reports/task1/REPORT-1-synthesis.md` 做交叉验证，但结论必须来自 `data/eco-data.json` 的二次统计（可复算脚本写在 `data/.scratch/`）。
3. 输出到 `data/reports/task2/E<N>.md`，用 [`data/reports/_TEMPLATE.md`](../reports/_TEMPLATE.md) 的元数据块开头。

## 必备章节（门禁会校验）

- `# 报告二 · E<N>：<主题>` 一级标题
- `## …执行摘要…`（一句话结论，含具体数字）
- `## …数据口径 / 信号…`（引用数据字典，说明企业需求的信号来自哪里）
- 主体分析：企业未满足需求逐项数据论证（每项：需求信号 vs 供给密度）
- **必备推荐表**（表头可用「推荐开发清单 / 可执行开发建议 / 开发建议 / 需求清单」任一写法，门禁接受这些别名）：

  | 插件设想 | 命中标签 | 需求证据（数字） | 目标用户 | 优先级 | 难度 |
  |---|---|---|---|---|---|

## 完成条件

文件写入 `data/reports/task2/E<N>.md` 即完成。5 份齐了之后由编排者运行 `node scripts/check-reports.mjs --wave 2` 门禁，不通过则修复。
