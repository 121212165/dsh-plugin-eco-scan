# 第二批修复后的口径复算报告（榜单质量门禁与领域分类法）

> 数据快照日期：2026-11-16（`data/eco-data.json` → `meta.date`）
> 数据来源：本库 `data/eco-data.json` / `data/digest.md`
> 趋势判断：不可做（`velocity.prevDate=null / overlap=0`，见 `data/DATA-DICTIONARY.md`）
> 生成者：batch2-ranking-taxonomy ｜ 生成日期：2026-11-20 ｜ 输出路径：`data/reports/BATCH2-QUALITY.md`

> **口径已修正**：本报告复算 issue #19/#20/#15/#16/#18/#22 的受影响数字。D1–D5 领域扫描报告中的相关数字为修复前口径，**以本报告与重新生成的 `data/digest.md` 为准**；D1–D5 正文已加同款标注，未改动其原始分析。

---

## 1. 榜单质量门禁（#19）

| 指标 | 复算值 |
|---|---|
| 全库 | 38,549 |
| 归档 `archived=1` | 415 |
| `coverage<0.4` | 19,524 |
| 两者交集 | 219 |
| 门禁排除合计 | 19,720 |
| 可入主榜 | 18,829 |

- 主榜（Top60）自检：归档入榜 **0**、低信号入榜 **0**；`perrylink/dsh-session-pin`（score 82.9、归档）与最高分 `coverage=0.1` 空壳均被排除。
- 注意 `row[12]=lowSignal` 用 `coverage<0.5`，门禁阈值是 0.4，两者不同。

## 2. 农场与重复簇（#20）

- 农场账号（>100 仓）**5 个 / 1,905 仓**：`uckkk` 1,296（仅 3 仓有下载，1,006 仓 score=48.8 克隆）、`xby-skill` 187、`perrylink` 181、`feely0208` 136、`omdsh-dev` 105。
- 全局 basename 重复簇 3,346 组；同作者近似名簇 49 组；`dsh-purge` 28 仓 / `dsh-plugin-guard` 23 仓 / `dsh-guard` 23 仓。
- 去重视图 `dedupView()` 每组仅保留最高分代表；验证徽章四级 + `applyVerificationFilter()` 支持一键过滤。主榜行尾显示徽章。

## 3. growth 覆盖率与异常值（#15）

- 有值 5,639 / 38,549 = **14.6%**；缺失 32,910；max 2607.4 / min −94.4；`>100` 共 150 个。
- `|growth|>100 且 stars<100` 异常 **145 个**，不进增长榜。
- 三套阈值澄清：`rows[4]` 是 raw 环比（无平滑/无下限）；评分 velocity 先验 20、`MIN_PREV_FOR_VELOCITY=5`；告警 `minPrev=20`。
- 所有引用 growth 的段落已强制带「n=5,639，覆盖 14.6%」注记。

## 4. 分类法（#16）

- 新增正交多标签 vertical：education 242 / healthcare 60 / finance 111 / gov 198 / content 150 / ecommerce 90 / general 37,701（兜底桶，多标签不可相加）。
- 安全标签 1,848 仓，二级子类：权限 163 / 审计 96 / 脱敏 7 / 合规留存 5 / 供应链 4；未细分 1,577。
- `capability × vertical` 交叉表（14 个 capability family × 7 vertical）与 vertical rollup 已写入 digest，可用 `capabilityVerticalRollup()` / `verticalRollup()` 复算（支持 50 标签粒度）。

## 5. 关键词假阳性（#18）

- 5 个已知案例回归 **5/5 通过**：wallpaper / schedule / classic / simplify / 工具隐喻 doctor 全部排除或降级。
- 命中一律标「未校验/假阳性风险」，不当领域总量；关键词只对 basename 匹配（消除 owner 假阳性）。
- 语义二次校验基于 `row[14]=description`：38,375 仓无 description（其中 1,157 仓有关键词命中）→ 校验不可用；description 为标签派生摘要，非原始 README，确认仅代表 capability 一致。

## 6. 留存风险（#22）

- 当前快照无 `installs_new` / `installs_returning` / `weekly_prev`，留存代理**不可计算**，需连续快照闭环。
- 高下载（≥1,000）+ 负增长 = `⚠ 存量留存风险`：全库 421 仓；`meta.downloadTop` 中 11/20 负增长。
- 点名案例均触发：`dsh-pet` −33.4%、`dsh-skins` −25.7%、`dsh-deep-whale` −23.2%，不列入首选推荐。
- 下载 = 装机代理，非活跃用户数。

---

## 7. 复算入口

```bash
node data/digest.mjs                       # 重算 digest.md（含全部新章节与自检）
node data/validate.mjs                     # 原有列/slug 契约校验
node data/dedup.mjs --filter --downloads --no-farm --limit 20   # 一键过滤
node --test test/{quality-gate,dedup,growth-quality,taxonomy,keyword-rules,retention,digest,dictionary,enrichment,tag-index}.test.mjs
```

数据字典 `data/DATA-DICTIONARY.md` §4/§4b/§8/§9/§10/§11 分别记录门禁、去重、growth、分类法、关键词、留存口径。
