# 数据分析 Runbook（issue #10）

> 固化「两波 agent → 两份报告 → 总结 → 建 issue → 验证推送」的顺序与质量门禁。换人执行也按此走，不靠人工记忆。
> 口径来源见 [`data/DATA-DICTIONARY.md`](DATA-DICTIONARY.md) 与 [`data/AGENT_BRIEF.md`](AGENT_BRIEF.md)；Windows 命令见仓库根 `CONTRIBUTING.md`。

## 0. 准备（每次重跑都要做）

```sh
# 0.1 确认快照与数据入口（README「数据入口」）
node -e "console.log(JSON.parse(require('fs').readFileSync('data/eco-data.json','utf8')).meta.date)"
# 0.2 快照更新时同步重建摘要（issue #9）
node data/digest.mjs
# 0.3 检查快照是否够做趋势判断（issue #11，不够就全程标记「不可做趋势判断」）
node scripts/check-snapshot-readiness.mjs   # 退出码 0=可做 2=不可做
```

读 `data/prompts/_common.md`，确认所有 agent 提示词都引用 brief / digest / 数据字典，禁止各自解释口径；临时脚本只写 `data/.scratch/`。

## 1. Wave1：10 个 agent（当前需求）

- 模板：`data/prompts/wave1.md` + `data/prompts/_common.md`。
- 并发启动 A1–A10，输出到 `data/reports/task1/A1.md` … `A10.md`。
- **门禁**：`node scripts/check-reports.mjs --wave 1`
  - 检查 10 份报告存在、含 H1、含必备章节（执行摘要 / 数据口径）、含「推荐开发清单」表且至少 1 行数据。
  - 失败 → 让对应 agent 修复后重跑；**不通过不得进入第 2 步**。

## 2. 生成报告一

汇总 A1–A10 → `data/reports/task1/REPORT-1-synthesis.md`（共识排名 + 推荐清单 + 红海黑名单）。
可选自检：`node scripts/check-reports.mjs --wave 1 --synth`。

## 3. Wave2：5 个 agent（企业未满足需求）

- **前置条件**：第 1、2 步门禁通过且报告一已生成。
- 模板：`data/prompts/wave2.md` + `data/prompts/_common.md`。
- 输出到 `data/reports/task2/E1.md` … `E5.md`。
- **门禁**：`node scripts/check-reports.mjs --wave 2`（推荐表表头别名见模板）。

## 4. 生成报告二

汇总 E1–E5 → `data/reports/task2/REPORT-2-synthesis.md`。
可选自检：`node scripts/check-reports.mjs --wave 2 --synth`。

## 5. 总结

`data/reports/FINAL-SUMMARY.md`：两份报告交叉验证 + 优先级路线图 + 数据可信度说明。
每份报告都按 `data/reports/_TEMPLATE.md` 写「数据快照日期 / 来源 / 采集起始周 / 趋势判断」四行元数据。

## 6. 建 issue

把复盘与领域扫描发现登记为 issue（如 #5/#7/#8/#9/#10/#11/#14/#21）；在 issue 里回链报告文件路径与验证结果。

## 7. 验证推送

```powershell
git -c http.sslBackend=schannel push -u origin <branch>
pwsh -File scripts/verify-delivery.ps1 -Repo 121212165/dsh-plugin-eco-scan -Branch <branch>
```

`verify-delivery.ps1` 校验本地 commit = 远端分支 SHA、远端 tree 必备文件、issue 列表、以及 `git check-ignore -v data/reports/FINAL-SUMMARY.md` 无输出。

## 门禁脚本与失败样例验证

`scripts/check-reports.mjs` 可用自定义目录 / ids 做负向验证（样例放 `data/.scratch/`，被 gitignore 忽略）：

```sh
# 正常数据应全绿
node scripts/check-reports.mjs --wave all
# 缺失报告：期望非 0 退出、报「文件缺失 / 报告数量」
node scripts/check-reports.mjs --wave 1 --dir data/.scratch/gate-missing --ids A1,A2
# 缺章节：期望非 0 退出、报「必备章节 / 推荐表章节」
node scripts/check-reports.mjs --wave 1 --dir data/.scratch/gate-nosection --ids A1,A2
```

## 领域扫描（D1–Dn）

领域扫描不纳入两波门禁；契约见 `data/AGENT_BRIEF.md`「领域扫描」章节，产物登记在 `data/reports/MANIFEST.md`。
