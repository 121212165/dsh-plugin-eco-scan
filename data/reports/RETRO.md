# 执行复盘（Retro）：本次生态需求扫描踩过的坑

> 目的：让下一次同类任务**质量更高、流程更丝滑、执行更简单**。
> 本次任务：10 agent 分析当前需求 → 报告一 → 5 agent 分析企业未满足需求 → 报告二 → 总结 → 提 issue + 推结果。

## 问题清单（现象 / 影响 / 本次对策 / 建议）

### 1. 数据不在"库"里，入口没有文档
- **现象**：`dsh-plugin-eco-scan` 仓库只有扫描器代码；真实数据是另一个仓库 `eco-report-2026-11-06` 的 `index.html`（3.2 MB），数据藏在第 165 行的 `window.__DATA__ = {...}` 里。需要先发现、克隆、按行截取 JSON。
- **影响**：每次分析都要重复"找数据"，可能拿错快照日期，开局就卡 10+ 分钟。
- **本次对策**：提取为 `data/eco-data.json` 并入库；写 `data/AGENT_BRIEF.md` 记录来源。
- **建议**：README 增加"数据入口"章节，写明权威数据源与快照日期；发布机器可读快照（JSON/CSV），或给出 `npx eco-core export --format json --out` 的具体命令；release 附数据产物。

### 2. `rows[]` 是位置数组，没有字段字典，agent 直接读错列
- **现象**：我写的 brief 把 `row[10]/row[11]` 标成 `isMain/isEnriched`；多个 agent 复核后确认实际是 `row[10]=isEnriched`（全库 174）、`row[11]=coverage`（=1 有 3,838 仓）。A1 和 E2 都做了校正，综合阶段才统一口径。
- **影响**：供给/主榜/富化率分析可能失真，需要人工逐份复核，直接拉低质量。
- **本次对策**：综合时以 meta 权威口径校正，并在报告里写明字段映射。
- **建议**：加 `data/DATA-DICTIONARY.md`，或给 `meta` 增加 `columns: [...]`；`digest.mjs` 输出列名表，作为 agent 唯一口径来源。

### 3. `.gitignore` 的 `reports/` 无锚点，静默吞掉嵌套报告目录
- **现象**：生成 `data/reports/**` 后 `git status` 完全看不到产物；用 `--untracked-files=all` 才定位到是 `.gitignore` 里 `reports/` 匹配任意层级。
- **影响**：差点漏推全部结果；下次很可能直接丢产物还不知道。
- **本次对策**：在 `.gitignore` 追加 `!data/reports/` 与 `!data/reports/**`。
- **建议**：把 `reports/` 改成 `/reports/`（只忽略根目录运行数据），或长期保留显式例外并加测试断言报告目录可 track。

### 4. Windows 环境缺少标准配方（clone 握手失败 / 中文乱码 / API 参数坑）
- **现象**：
  - `git clone` 两次 `schannel: failed to receive handshake`，加 `-c http.sslBackend=schannel` 才成功；
  - `gh repo clone ... -- --depth 1` 报 `Too many arguments`，得改用直接 `git clone`；
  - PowerShell 直接读中文文件乱码，必须 `Get-Content -Encoding UTF8`；
  - `gh api "repos/.../contents/path?ref=main"` 返回 404，改用 `-f ref=main` 才通过。
- **影响**：每个坑重试一次，1–2 分钟/次，执行极不丝滑。
- **本次对策**：逐个试出可用命令，未沉淀。
- **建议**：README/CONTRIBUTING 加"Windows 环境备忘"；提供 `scripts/verify-delivery.ps1` 统一做推送验证（commit、远端 tree、issue 列表）。

### 5. 15 个 agent 没有统一 onboarding 包，也没有暂存区约定
- **现象**：没有现成 brief 和 digest，我临时写了 `AGENT_BRIEF.md` + `digest.mjs`；各 agent 把 `_a3_analysis.cjs`、`a4-analysis.js`、`gaps.txt` 等脚本散落在 `data/` 根目录，提交前才手工清理。
- **影响**：口径不一致（字段映射错误即源于此），提交前多一道清理工序。
- **本次对策**：清理了 scratch 文件；brief/digest 已固化为仓库文件。
- **建议**：把 `data/AGENT_BRIEF.md` + `data/digest.mjs` 作为一等资产维护；规定 agent 临时脚本写入 `data/.scratch/` 并在 `.gitignore` 忽略。

### 6. 两波 agent 的顺序靠人工控制，没有 runbook / 质量门禁
- **现象**："完成第一份后再开始第二份"是我手工判断；10 个 agent 一次并行启动，5 个同样；质量靠我逐份读 10+5 份报告。
- **影响**：换人执行容易乱序、漏步骤；报告齐全性没有机器校验。
- **本次对策**：人工确认 10 份报告文件齐全后才启动第二波。
- **建议**：提供 `data/runbook.md` 或编排脚本：wave1（10 agent）→ 校验 10 份报告存在且含推荐表 → 生成报告一 → wave2（5 agent）→ 校验 5 份 → 生成报告二 → 总结 → 建 issue → 验证推送。

### 7. `velocity` 全空、只有单快照，增长结论只能当方向参考
- **现象**：`velocity.prevDate=null / days=null / overlap=0`，note 为"数据积累中"；报告里所有增长率都是单快照样本信号。
- **影响**：无法识别"增速加快"的趋势型蓝海，两份报告的分析质量上限被数据卡住。
- **本次对策**：在报告里显式声明局限，不把增长当严格结论。
- **建议**：用内置 scheduler 或系统 cron 每天跑 `eco-core scan`，积累连续快照；分析前先检查至少 2–3 期可用快照，再决定是否做同比/校准。

---

## 已固化的改进（本次已落地）

- `data/AGENT_BRIEF.md`：agent 统一口径简报（数据源、行结构、标签表、矩阵、全局数字、输出模板）。
- `data/digest.mjs` → `data/digest.md`：一条命令重建数据摘要，避免每个 agent 重复造轮子。
- `data/eco-data.json`：机器可读数据快照，免再去另一个仓库的 HTML 里抠。
- `.gitignore` 例外：确保 `data/reports/**` 能入库。
- `data/reports/`：17 份报告 + 总结 + 本复盘，全部已推送。
