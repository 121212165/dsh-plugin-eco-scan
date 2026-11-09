# eco-report — 生态报告构建管线

把 `eco.db`（SQLite 情报库）渲染成可自查的排行榜仪表盘：覆盖率加权评分、低信号分段、星标增速、大类×能力下钻矩阵、增长跑道，并附带三道浏览器门禁。

扫描器本身在仓库 `scripts/full-corpus-sweep.mjs`；这里只放**加工与验证**脚本，reports 目录是运行数据，不随源码发布。

## 环境

- Node ≥ 22.18（用到内置 `node:sqlite`，需 `--experimental-sqlite`）
- 浏览器门禁：Playwright Python，本机只能用 `py -3.12`（`python` 是别的垫片），且必须 `channel="msedge"`
- 数据库默认在 `~/.dsh/eco-scan/eco.db`，可用 `ECO_DATA_DIR` 指向别处

## 一条命令重建（已有数据库）

```bash
node --experimental-sqlite tools/eco-report/build_dashboard.mjs
```

产物写在 `tools/eco-report/`（`dashboard.html`、`full-ranking.json`、`full-ranking.csv`、`tags-summary.json`、`scoring-diff.json`），同时复制一份到 `reports/<最新扫描日>/`；`ECO_REPO_DIR` 可改后者根目录。

## 完整周更流程

```bash
# 0) 采集：仓库根目录，约 1–2 小时，务必后台跑
ECO_PLAN_FILE=... ECO_PROGRESS_FILE=... node scripts/full-corpus-sweep.mjs plan
ECO_PLAN_FILE=... ECO_PROGRESS_FILE=... node scripts/full-corpus-sweep.mjs fetch

# 1) 扩 npm 映射 + 回填 weekly（先干跑看数字，再 --write）
node --experimental-sqlite tools/eco-report/npm_map_expand.mjs
node --experimental-sqlite tools/eco-report/npm_map_expand.mjs --write

# 2) 可选：能力标签补全（需要 generic-repos.json / pilot-readme-cache.json /
#    npm-keywords-cache.json，这三个是 Git 未收录的中间缓存）
node --experimental-sqlite tools/eco-report/batch_signal.mjs 6
node --experimental-sqlite tools/eco-report/retag_enrichment.mjs

# 3) 重建 + 门禁
node --experimental-sqlite tools/eco-report/build_dashboard.mjs
PYTHONIOENCODING=utf-8 py -3.12 tools/eco-report/verify_matrix.py
PYTHONIOENCODING=utf-8 py -3.12 tools/eco-report/verify_dashboard.py

# 4) 公众号双榜（潜力榜重算 + 段落截图，单张 ≤6000px）
node --experimental-sqlite tools/eco-report/potential-v4.mjs
node --experimental-sqlite tools/eco-report/build_wechat.mjs
ECO_WECHAT_HTML="file:///<repo>/reports/<date>/wechat.html" PYTHONIOENCODING=utf-8 py -3.12 tools/eco-report/verify_wechat.py
ECO_WECHAT_HTML="file:///<repo>/reports/<date>/wechat.html" PYTHONIOENCODING=utf-8 py -3.12 tools/eco-report/capture_image.py

# 5) 单元测试
npm run test:report
```

## 脚本

| 文件 | 作用 |
| --- | --- |
| `lib.mjs` | 纯函数：百分位、覆盖率加权评分、README 清洗、标签匹配（单测覆盖） |
| `taxonomy.mjs` | 46 个能力标签的关键词规则 |
| `build_dashboard.mjs` | 主构建：评分、排名、矩阵、增速、HTML/CSV/JSON |
| `dashboard_app.js` / `dashboard_template.html` | 前端与模板，被构建内联 |
| `npm_map_expand.mjs` | 用 npm registry 搜索索引扩 repo→package 映射；weekly 取搜索结果自带的 `downloads.weekly`，并刷新既有包的周下载 |
| `batch_signal.mjs` | 从清洗后的 README 头 + npm keywords 批量补能力标签候选 |
| `signal_tags.mjs` / `retag_enrichment.mjs` | 断言式（v3）补标签与离线复打 |
| `verify_matrix.py` | 门禁：矩阵格子＝双标签交集，且与榜单口径一致 |
| `verify_dashboard.py` | 门禁：分页、低信号视图、星标增速、覆盖率列 |
| `potential-v4.mjs` | 重算潜力榜（≤180 天、≤20k★，动量/星速/下载/近期增量/新鲜度加权） |
| `build_wechat.mjs` / `verify_wechat.py` / `capture_image.py` | 公众号 HTML、复制校验、潜力/排名两张长图（≤6000px），`ECO_WECHAT_HTML` / `ECO_WECHAT_OUT` 指定路径 |
| `test/lib.test.mjs` | `node --test` 单测（评分/标签/清洗） |

## 口径要点

- **综合分** = `0.40×星标百分位 + 0.30×下载百分位 + 0.20×增长百分位 + 0.10×活跃度`，再把缺项按 `coverage` 用中性先验 50 填补；`coverage<0.5` 标「低信号」，默认不进主榜。
- 百分位只在**有该信号的仓库**内计算；`weekly=0` 不算有下载信号。
- 主榜 = 未归档且 `coverage ≥ 0.4`；全量仍可在页面关闭过滤后查看。
- 星标增速来自相邻两次快照真差分；只有一次快照时显示「数据积累中」。
- npm 周下载来自 registry 搜索索引（`downloads.weekly`，与 point API 抽查一致），环比来自最近一次 package range 窗口。
- 公众号长图按「潜力榜 / 排名榜」各截一张，DPR 自动下调保证单张 ≤6000px。
- 矩阵格子＝同时带“大类＋能力”两个标签的仓库数，多标签重复计数；「仅通用」列是信息缺口，不是 0。
