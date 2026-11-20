# 贡献指南

本仓库的可复现分析流程见 [`data/runbook.md`](data/runbook.md)；agent 统一口径见 [`data/AGENT_BRIEF.md`](data/AGENT_BRIEF.md)；字段含义见 [`data/DATA-DICTIONARY.md`](data/DATA-DICTIONARY.md)。

## Windows 环境备忘（已验证配方）

| 场景 | ❌ 踩坑写法 | ✅ 可用写法 |
|---|---|---|
| clone / fetch 握手失败 | `git clone ...`（`schannel: failed to receive handshake`） | `git -c http.sslBackend=schannel clone https://github.com/121212165/<repo>.git`；已有仓库用 `git -c http.sslBackend=schannel fetch origin` |
| 浅克隆 | `gh repo clone <repo> -- --depth 1`（`Too many arguments`） | 直接 `git clone`，不要经 `gh repo clone` 转发 `--depth` |
| 读中文文件乱码 | `Get-Content file.md` | `Get-Content -Encoding UTF8 file.md` |
| `gh api` 传 ref | `gh api ".../contents/path?ref=main"` 或裸 `-f ref=main`（gh 会翻成 POST → 404） | `gh api ".../contents/path" --method GET -f ref=main`；tree 用 `gh api ".../git/trees/main" --method GET -f recursive=1` |
| 递归搜索 | 在 `C:\Users\lenovo` 全盘 `Get-ChildItem -Recurse`（120s 超时） | 先进入目标 worktree，再用 `Get-ChildItem -Recurse -File -LiteralPath .`；仓库内优先 `git grep -n "关键词" -- data/` |

约定：任何递归搜索都必须带一个明确的根目录参数（默认当前 worktree），禁止把 `$HOME` 或 `C:\Users\<user>` 当搜索根。

## 交付验证

推送后运行（本地自测可加 `-LocalOnly`）：

```powershell
pwsh -File scripts/verify-delivery.ps1 -Repo 121212165/dsh-plugin-eco-scan -Branch batch3-docs-process
```

详见 [`scripts/verify-delivery.ps1`](scripts/verify-delivery.ps1) 头部说明。

## Agent onboarding 与暂存区（issue #9）

### 一等资产：brief + digest

- [`data/AGENT_BRIEF.md`](data/AGENT_BRIEF.md) 与 [`data/digest.mjs`](data/digest.mjs)（产出 [`data/digest.md`](data/digest.md)）是仓库一等资产，**不要**在每个 agent 提示词里重写数据口径。
- 快照更新时（替换 `data/eco-data.json` 后）**必须**同步重建摘要：

  ```sh
  node data/digest.mjs        # 重建 data/digest.md
  ```

  同时更新 `data/AGENT_BRIEF.md` 头部快照日期与报告模板里的「数据快照日期」字段。
- 所有 agent 提示词统一引用 [`data/prompts/_common.md`](data/prompts/_common.md)（内含 brief / digest / 数据字典引用与 scratch 约定），禁止各自解释数据口径——字段映射错误（如 `row[10]`/`row[11]` 读反）正是口径各自解释造成的。

### 暂存区约定

- agent 的临时脚本、中间产物**只能**写到 `data/.scratch/`，提交前不要清理到 `data/` 根目录以外的地方；`data/.scratch/` 已在 `.gitignore` 忽略。
- 可复算的最终分析器（如 `data/heat.mjs`）不属于 scratch，直接放 `data/`。
- 自检：`git check-ignore -v data/.scratch/probe.cjs` 应有输出；`git status --untracked-files=all` 不应出现散落在 `data/` 根的临时文件。
