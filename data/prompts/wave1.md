# Wave 1 agent 提示词模板（当前需求分析，A1–A10）

> 启动每个 agent 时，把本模板 + [`_common.md`](_common.md) 一起作为提示词；不要改写 `_common.md` 里的口径段落。

## 你的任务

你是 wave1 的第 `<N>` 个 agent（`<N>` = 1..10），负责主题：`<从分工表领取，例如 会话管理 / 工作区 / 成本额度 …>`。

1. 读 [`_common.md`](_common.md) 并**严格遵守**：引用 `data/DATA-DICTIONARY.md`、`data/AGENT_BRIEF.md`、`data/digest.md`，不要自行解释字段口径，不要把 `null` 当 0，不要写严格趋势结论。
2. 从 `data/eco-data.json`（快照 2026-11-16，38,549 仓 / 50 标签）按你的主题做二次统计；可复算脚本写在 `data/.scratch/`。
3. 输出到 `data/reports/task1/A<N>.md`，用 [`data/reports/_TEMPLATE.md`](../reports/_TEMPLATE.md) 的元数据块开头。

## 必备章节（门禁会校验）

- `# A<N>｜<主题>` 一级标题
- `## …执行摘要…`（一句话结论，含具体数字）
- `## …数据口径…`（引用数据字典，说明信号可信度）
- 主体分析：每节「一个问题 + 一组数字 + 一个判断」
- `## …推荐开发清单…`（**必备表**）：

  | 插件设想 | 命中标签 | 需求证据（数字） | 目标用户 | 优先级(高/中/低) | 难度(低/中/高) |
  |---|---|---|---|---|---|

- `## …风险与局限…`（单快照 velocity 全空、heat 断点前 0 = 无数据等）

## 完成条件

文件写入 `data/reports/task1/A<N>.md` 即完成。10 份齐了之后由编排者运行 `node scripts/check-reports.mjs --wave 1` 门禁，不通过则修复。
