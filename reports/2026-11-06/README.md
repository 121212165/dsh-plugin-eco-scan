# dsh 插件生态扫描 · 2026-11-06

**分区穷尽**后的生态快照 + 潜力指数榜单。可视化报告：[index.html](index.html)、[potential.html](potential.html)。

## 文件

| 文件 | 内容 |
|---|---|
| `index.html` | 自包含 HTML 报告：覆盖度、赛道分布、Top 200、增长榜、同口径趋势 |
| `potential.html` | 潜力指数榜单：2,080 个新兴候选 → 1,268 个可评分项目（页面渲染前 400） |
| `potential.json` | 潜力榜单完整数据：原始指标、五项百分位、权重与过滤条件 |
| `report.md` / `report.json` | `eco-core export` 生成的标准报告（覆盖度、赛道表、Top 20、变化） |
| `top.json` | 综合评分 Top 200 的完整字段（分项分、cohort、stars、周下载、release） |
| `diff.json` | 2026-10-17 → 2026-11-06 的差值，只保留两个日期都有快照的 178 条 |
| `corpus-plan.json` | 分区计划：154 个抓取桶、每桶查询与预期条数 |
| `health.json` | 扫描健康状态：最近一次扫描、日期列表、错误 |
| `../../scripts/full-corpus-sweep.mjs` | 分区穷尽语料的脚本（`plan` / `fetch`，带断点续抓） |
| `../../scripts/full-corpus-enrich.mjs` | 全量 npm 映射与下载量刷新（索引化，不删除已有映射） |
| `../../scripts/full-corpus-trim.mjs` | 映射清洗：丢掉子串猜测与同名竞争者，再重建当日快照的下载列 |

## 本次扫描

- 语料：`topic:dsh-plugin`、`topic:dsh-plugins`、`dsh-plugin in:name`、`dsh-plugins in:name`、`dsh-plugin in:description`、`dsh-plugins in:description`、`cordis plugin in:description`、`deepseek-harness dsh-plugin in:description`
- 分区：按 `created` 日期递归切分，单日仍超 1,000 时再按 star 区间 / `pushed` 区间切 → **154 个桶**，桶内合计 52,806 条
- 结果：**去重 33,576 个仓库**，抓取失败 0；数据库累计 33,591 个仓库、5 个快照日期
- npm：搜索 2,000 个包、落库 1,429 个包的下载量；映射 1,680 个仓库（5.0%），其中 `confidence=1` 的 registry 已验证 1,608 个；**1,327 个仓库有周下载**
- 映射清洗：启发式映射先 17,294 条，砍掉 12,558 条子串猜测（<0.85），再按“一个包只归一个仓库”丢掉 2,901 条失败者，最后 1,835 条。不清洗的话 Top 200 会被 1 star 却借用别人下载量的克隆仓占满
- release：仍沿用上一轮的 250 条缓存，本轮未重抓

### 为什么能“跑全”

GitHub 搜索 API 每条查询最多返回 1,000 条（REST 和 GraphQL 都一样），所以 `topic:dsh-plugin` 的 27,612 条不可能一次抓完。脚本把每条查询按建仓日期递归二分，直到每个桶 ≤1,000 条，再逐桶抓取并去重——这是绕开 1,000 条上限的标准做法，不是提高 `maxRepos` 能解决的。

`dsh in:name`（62,409）与裸 `deepseek-harness`（39,646）没有纳入：前者大量是无关的 DSH 缩写项目，后者会拉进 1Panel、cc-switch 这类只是提到 DeepSeek Harness 的仓库。要扩到这两条，只需把它们加进脚本的 `BASE_QUERIES` 重新 `plan` + `fetch`。

## 潜力指数

单独打开 [potential.html](potential.html)。它不复用综合评分，口径更偏“新项目动量”：

- **候选池 2,080**：有今日快照、未归档、非 awesome 清单、创建 ≤180 天、stars ≤20,000
- **可评分 1,268**：至少 2 个信号、权重覆盖 ≥45%，并且有 npm 信号或“星速 + 20 日惯性”
- **npm 只认已验证映射**：`repo_npm_map.confidence = 1`，避免启发式映射把一个包共享给几十个仓库导致的虚高
- **周环比做阻尼**：`(本周 − 上周) / (上周 + 200)`，小基数不会算出 +900%
- **权重**：动能 35% · 星速 25% · 牵引 20% · 惯性 10% · 新鲜 10%

Top 3：`saos-3624/dsh-video-storyboard` 98.8、`liguobao/ds-harness-remote` 98.5、`saos-3624/dsh-see-now` 98.4。分数是候选池内的相对百分位，池子变大后与上一版（221 个可评分）不可直接比较。

## 口径与限制

1. **穷尽的是这 8 条查询，不是 GitHub 全站**：没打 `dsh-plugin` 标签、名字与描述里也不含 `dsh-plugin` 的插件仍然不在语料里。
2. **质量分不可用**：CI、测试目录、贡献者数、issue 关闭时长只有 GraphQL 详情阶段采集；全量 sweep 走轻量搜索字段，这 33,576 个仓库里绝大部分四项为空，质量分被压到默认值。
3. **npm 覆盖受注册表搜索上限约束**：只搜到 2,000 个包，落库 1,429 个包的下载量，映射 1,680 个仓库。清洗后仍保留的启发式映射只有 72 条（0.85 精确同名且无竞争者），可以当作弱信号；潜力榜只用 `confidence=1`。
4. **综合评分榜已被下载量主导**：`eco-core top` 的四个分量里，只有 adoption 在全量语料下还有区分度（CI/测试/贡献者几乎全空），所以 Top 200 读起来更像“下载量榜”，会出现 1 star 排前面的仓库。判断“值得关注”请用潜力榜。
5. **趋势样本仍然很薄**：2026-10-17 只有 186 个仓库的快照，所以差值榜只有 178 条有历史；跨日期比较另有 158 个五天都在的 cohort。下次全量 sweep 之后，历史才会厚起来。
6. **抓取时点不一致**：154 个桶跨约 40 分钟抓完，期间的 star 数与新增仓库不是同一瞬间的快照。

## 复现

```sh
# 1) 分区计划（只查 repositoryCount，不写库）
node scripts/full-corpus-sweep.mjs plan

# 2) 逐桶抓取 + 落库 + 写当日快照（可中断续跑，进度在 full-progress.jsonl）
node scripts/full-corpus-sweep.mjs fetch

# 3) 全量 npm 映射与下载量（索引化，保留已有映射）
node scripts/full-corpus-enrich.mjs

# 4) 清洗映射并重建当日快照的下载列
node scripts/full-corpus-trim.mjs

# 5) 标准产物
npx eco-core top --limit 200 --json
npx eco-core diff --from 2026-10-17 --to 2026-11-06 --json
npx eco-core export --format md|json|html --out
```

数据目录默认 `~/.dsh/eco-scan`（`eco.db` 不随本目录发布）。本轮写库前的备份留在 `~/.dsh/eco-scan/eco.db.bak-before-full-2026-11-06`。
