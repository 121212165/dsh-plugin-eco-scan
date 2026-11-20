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
