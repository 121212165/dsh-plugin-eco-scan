# dsh-plugin-eco-scan

**EN** · Market scan of the dsh plugin ecosystem: stars, npm weekly downloads and release-asset download counts per repo, segmented into niches, with growth computed as a **delta between daily snapshots** rather than inferred from a single day (`/eco-scan`). · 12 `node --test` green · scanned real GitHub + npm data on this machine · the npm-package↔repo matching heuristic is not exhaustively checked.

DeepSeek Harness (dsh) 插件：**插件生态市场扫描器**。抓取 dsh 插件生态（GitHub topic: dsh-plugin / dsh-plugins）的全部仓库，采集星标、npm 周下载、release 资产下载量三类真实数据，按细分赛道归类，把每日扫描写入快照，用**差值**算增长，找出高增长插件与高增长赛道。

适合回答："dsh 生态里哪个赛道在涨？哪些插件是高增长标的？我下个插件该卡哪个位？"

同系列：[price-aware](https://github.com/121212165/dsh-plugin-price-aware) · [cost-ledger](https://github.com/121212165/dsh-plugin-cost-ledger) · [relay-quota](https://github.com/121212165/dsh-plugin-relay-quota) · [transcript](https://github.com/121212165/dsh-plugin-transcript) · [transcript-search](https://github.com/121212165/dsh-plugin-transcript-search) · [obsidian-push](https://github.com/121212165/dsh-plugin-obsidian-push) · [session-insights](https://github.com/121212165/dsh-plugin-session-insights)。

## 用法

- **`/eco-scan`** / **`eco_scan` 工具**：执行一次扫描，输出：
  1. 生态规模（仓库数）
  2. **细分赛道表**：成本预算 / 遥测分析 / 记忆上下文 / UI 客户端 / 工具开发 / 搜索知识 / 归档导出 / 框架运行时——各赛道的仓库数、星标、周下载、中位星标
  3. **高增长 Top N**：按 `增长率 × √规模` 评分排序（速度主导、体量加权），只收正增长
  4. **细分赛道增长中位**：哪个赛道整体在涨
- **快照差值**：每次扫描写入 `~/.dsh/eco-scan/snapshots-YYYY-MM.jsonl`，同日重扫覆盖，跨日差值即增长。**第一天只有规模，从第二天起才有增长判断**。

## 细分规则

按仓库名 + 描述关键词，规则有序、首个命中生效：cost-budget → telemetry-analytics → memory-context → ui-client → archive-export → search-knowledge → tools-devx → framework-runtime → other。

## 增长口径（诚实声明）

GitHub **没有仓库级下载量**。本插件用三个可得的代理指标，按可用性择优：
1. **npm 周下载**（`api.npmjs.org/downloads/point/last-week`，与生态关键词匹配的包）
2. **release 资产下载计数**（GitHub Releases API 求和）
3. **星标**（感知度，不是下载）

npm 包与仓库的匹配是名称启发式（`dsh-plugin-<x>` ↔ 仓库 `<x>`），可能有漏配——这是已知局限。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `tokenEnv` | `[GITHUB_TOKEN, GH_TOKEN]` | GitHub token（无 token 60 次/小时限流，建议设置） |
| `dataDir` | `~/.dsh/eco-scan` | 快照目录 |
| `topGrowth` | `15` | 高增长榜行数 |

## 安装

三步，实测于 `@deepseek-ai/dsh@0.1.7-alpha.1`（需 `pnpm` 在 PATH 上）：

```sh
# ① 装进 profile：dsh plugin 把参数原样转发给 pnpm，git 包会自动跑 prepare 构建 lib/
dsh plugin --profile web add github:121212165/dsh-plugin-eco-scan
```

② 把本仓库根目录 `cordis.patch.yml` 的内容**并进** `$DSH_HOME/profiles/web/cordis.patch.yml`。
该文件默认是 `[]`，所以要么整份替换，要么把 insert 条目并进同一个数组；**不要直接追加**——
追加会形成两个 YAML 文档，启动即报
`failed to parse overlay ... end of the stream or a document separator is expected`（本机实测踩过）。

③ 重启 dsh。配置层与 client 半都要重启才生效（客户端按 boot 时算出的内容 rev 下发，硬刷新浏览器没用）。

自检挂载：`dsh --profile web --dump-config | grep dsh-plugin-eco-scan`，应看到该条目。
## 验证状态

- 细分/增长/快照为纯函数，12 个 node --test 全绿。
- 真实扫描已在本机执行（结果见本仓库 early scan 记录）。
- npm 包-仓库匹配启发式未全面校验。

## 借鉴来源与差异（非盲目复制）

| 借鉴来源 | 借鉴了什么 | 我们的差异 |
|---|---|---|
| [AdamPlatin123/dsh-plugin-radar](https://github.com/AdamPlatin123/dsh-plugin-radar)（1466★） | 「dsh 生态雷达」这个方向本身 | radar 是重基建（2.1 万候选、k8s 运行级实测、15 分钟快照）；本插件是**轻量在 harness 内**的细分市场分析器：赛道关键词细分、npm 周环比 live 榜、`增长率×√规模`评分、本地快照差值。数据口径与排名算法为独立设计，未参考其代码 |
| OpenRouter npm range API | 用 downloads/range 做周环比的数据源用法 | — |
