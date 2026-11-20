# ECO DATA DIGEST (snapshot 2026-11-16)

> 榜单口径已修正（2026-11-20）：Top60 现为**全局 score 排序**，不再使用 `r[10]===1 || r[2]>2000` 过滤。

Total repos: 38549
Counts: {"repos":38549,"starPositive":16661,"weeklyPositive":7001,"growthPositive":5639,"archived":415,"mainRows":18829,"lowSignal":19868,"weeklySum":7837245,"miscOnly":3425,"miscPct":8.9,"miscNoDesc":1166,"reachCoveragePct":18.16,"reachCoverageMainPct":37.02,"coverage":[{"cov":0.1,"n":19524},{"cov":0.4,"n":563},{"cov":0.5,"n":12024},{"cov":0.6,"n":1801},{"cov":0.7,"n":0},{"cov":0.8,"n":799},{"cov":0.9,"n":0},{"cov":1,"n":3838}],"velocity":{"prevDate":null,"days":null,"overlap":0,"note":"数据积累中：可比较的快照仓库太少"},"new30":14695,"young90":15963,"est":7891,"tags":50,"enriched":174}

## COLUMN NAMES (see data/DATA-DICTIONARY.md)
- [0] `id` — owner/repo 全名
- [1] `score` — 综合分（百分位加权 + (1−coverage)×50 中性先验）
- [2] `stars` — GitHub star 数
- [3] `weekly` — npm 最近一周下载量（空值：null = 未关联 npm 包或未取到下载数据（低信号来源））
- [4] `growthRawPct` — 原始环比增长百分比（未除 coverage）（空值：null = 无可比快照/无增长信号）
- [5] `ageDays` — 仓库创建至今天数（空值：null = 未取到 created_at）
- [6] `segIdx` — 主赛道数字下标（meta.segments 索引）
- [7] `activity` — 活跃分（0–100）
- [8] `archived` — 是否归档 0/1
- [9] `tags` — 能力标签数字下标数组（meta.tags 索引）（空值：[] = 无能力标签；用 meta.tagIndex 做 slug↔下标转换）
- [10] `isEnriched` — 是否富化 0/1（README/npm 关键词补全标签，全库 174）（空值：非 null；注意这不是 isMain）
- [11] `coverage` — 信号覆盖率 = 星0.4+下载0.3+增长0.2+活跃0.1 中已有项权重和（空值：0 = 完全无信号；coverage=1 有 3838 仓）
- [12] `lowSignal` — 低信号标志 0/1（coverage<0.5）
- [13] `starVel` — star 增长速率（快照间 star 差）（空值：本快照恒为 null（无连续可比快照），保留列以兼容位置索引）
- [14] `description` — 富化摘要文本（能力标签 + 赛道），仅富化仓生成（空值：null = 非富化仓或该快照无可生成摘要）
- [15] `license` — 开源许可证（空值：null = 权威快照未提供，需用 GitHub API 补全（未知））
- [16] `latest_version` — 最新发布版本号（空值：null = 权威快照未提供，需用 GitHub/npm API 补全（未知））
- [17] `owner` — 仓库归属者（id 中 / 之前的部分）（空值：通常非空；id 格式异常时为空串）

## TAG ID CROSSWALK
`meta.tags[].id` 是 slug，`rows[].tags` 存数字下标；用 `meta.tagIndex[slug]` 转换。
示例：video→0, image→1, voice→2, screen→3, vision→4

## PER-TAG STATS
> growth：n=5,639，覆盖 14.6%（全库 38,549，缺失 32,910；单快照样本信号，不可当全量结论）（下表 growth med / +growth 只覆盖有值样本）
| tagIdx | slug | name | fam | n | ★med | ★p90 | weekly med | weekly sum | growth med | +growth | new≤30d |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 18 | webui | 网页界面 | 交互 | 8678 | 0 | 5 | 341 | 1686812 | -0.9 | 449 | 3012 |
| 21 | session | 会话管理 | 交互 | 7884 | 0 | 4 | 352 | 1405163 | 0 | 470 | 3572 |
| 28 | agent | 智能体 | 编排 | 6389 | 1 | 9 | 351 | 1133314 | -0.4 | 339 | 2296 |
| 31 | llm | 模型接入 | 模型 | 5420 | 0 | 6 | 350 | 964553 | -0.3 | 323 | 1991 |
| 22 | workspace | 工作区 | 交互 | 4293 | 0 | 4 | 369 | 1019993 | 0 | 246 | 2228 |
| 19 | desktop | 桌面客户端 | 交互 | 4005 | 1 | 6 | 349 | 760290 | -1 | 172 | 1498 |
| 37 | design | 设计/排版 | 设计 | 3937 | 0 | 5 | 324 | 668156 | -1.4 | 172 | 1559 |
| 26 | code | 编码/代码 | 开发 | 3591 | 1 | 10 | 342 | 789923 | 0 | 200 | 1208 |
| 49 | misc | 其他 | 其他 | 3425 | 0 | 1 | 285 | 182924 | 0 | 98 | 869 |
| 30 | skill | 技能/Prompt | 编排 | 3232 | 0 | 8 | 372 | 387424 | 0 | 153 | 1190 |
| 41 | manager | 安装/管理 | 平台 | 3001 | 0 | 4 | 356 | 507178 | -0.5 | 140 | 1109 |
| 27 | file | 文件/目录 | 开发 | 2769 | 0 | 4 | 358 | 562817 | 0 | 141 | 1169 |
| 10 | doc | 文档/笔记 | 知识 | 2706 | 0 | 7 | 387 | 435472 | -0.6 | 147 | 1151 |
| 40 | market | 插件市场 | 平台 | 2457 | 0 | 5 | 357 | 792621 | 0 | 148 | 977 |
| 9 | search | 搜索/检索 | 知识 | 2177 | 0 | 6 | 351 | 876889 | -0.7 | 112 | 903 |
| 33 | cost | 成本/额度 | 模型 | 2152 | 0 | 4 | 356 | 501042 | -1.4 | 105 | 848 |
| 1 | image | 图像/绘图 | 媒体 | 2035 | 1 | 7 | 436 | 503262 | -0.7 | 105 | 735 |
| 13 | mcp | MCP | 连接 | 1962 | 0 | 12 | 356 | 360148 | 0 | 119 | 722 |
| 39 | security | 安全 | 安全 | 1848 | 0 | 5 | 295 | 279742 | -1.3 | 93 | 702 |
| 34 | analytics | 统计/监控 | 数据 | 1816 | 0 | 3 | 289 | 253609 | -0.4 | 83 | 718 |
| 45 | runtime | 框架/运行时 | 基础设施 | 1795 | 0 | 5 | 257 | 1337335 | 0 | 70 | 557 |
| 6 | persona | 人格/陪伴 | 认知 | 1792 | 1 | 9 | 462 | 531439 | -4.6 | 65 | 868 |
| 5 | memory | 记忆 | 认知 | 1760 | 1 | 7 | 452 | 438224 | -2.4 | 105 | 780 |
| 25 | git | Git/提交 | 开发 | 1658 | 0 | 7 | 348 | 586932 | 0 | 106 | 588 |
| 29 | workflow | 工作流 | 编排 | 1418 | 1 | 7 | 388 | 172156 | -0.7 | 85 | 505 |
| 16 | social | 社交/IM | 平台 | 1410 | 0 | 7 | 570 | 361993 | -2.7 | 60 | 750 |
| 12 | browser | 浏览器 | 开发 | 1295 | 0 | 7 | 405 | 374468 | 0 | 75 | 456 |
| 23 | automation | 自动化 | 开发 | 1283 | 1 | 10 | 386 | 423430 | -1.3 | 70 | 527 |
| 32 | routing | 路由/网关 | 模型 | 1191 | 0 | 6 | 380 | 171911 | -0.3 | 78 | 431 |
| 48 | collection | 插件合集 | 平台 | 1081 | 0 | 1 | 285 | 69643 | 0 | 28 | 468 |
| 2 | voice | 语音/音频 | 媒体 | 1043 | 0 | 5 | 433 | 207900 | -1.7 | 44 | 532 |
| 14 | remote | 远程/隧道 | 连接 | 1024 | 1 | 9 | 447 | 363371 | 0 | 66 | 375 |
| 4 | vision | 视觉/多模态 | 媒体 | 966 | 1 | 8 | 346 | 238260 | -3.1 | 40 | 260 |
| 7 | context | 上下文/压缩 | 认知 | 945 | 0 | 6 | 413 | 274519 | 0 | 62 | 421 |
| 35 | export | 导出/归档 | 数据 | 898 | 0 | 3 | 404 | 138018 | -0.9 | 48 | 438 |
| 42 | notify | 通知/提醒 | 平台 | 872 | 0 | 3 | 330 | 87949 | -1.8 | 41 | 376 |
| 20 | cli | 命令行 | 交互 | 871 | 1 | 23 | 329 | 233770 | -2.2 | 46 | 255 |
| 43 | productivity | 生产力/办公 | 平台 | 805 | 0 | 3 | 385 | 81793 | 0 | 45 | 433 |
| 38 | i18n | 中文本地化 | 设计 | 744 | 0 | 5 | 297 | 86605 | -1.8 | 36 | 350 |
| 0 | video | 视频/分镜 | 媒体 | 698 | 1 | 11 | 725 | 318205 | -3.5 | 39 | 373 |
| 24 | shell | Shell/执行 | 开发 | 696 | 0 | 6 | 307 | 94930 | -0.3 | 37 | 204 |
| 15 | mobile | 移动端 | 平台 | 687 | 1 | 15 | 415 | 251867 | 0 | 42 | 279 |
| 3 | screen | 屏幕感知 | 媒体 | 625 | 0 | 4 | 338 | 111561 | -3.4 | 26 | 318 |
| 8 | rag | 知识库/RAG | 知识 | 507 | 1 | 20 | 405 | 201848 | -1.3 | 34 | 175 |
| 11 | awesome | 精选清单 | 其他 | 493 | 0 | 18 | 304 | 168056 | 0 | 12 | 150 |
| 44 | game | 娱乐/游戏 | 其他 | 345 | 1 | 11 | 405 | 36386 | 0 | 18 | 148 |
| 46 | health | 诊断/自检 | 开发 | 312 | 0 | 3 | 324 | 35519 | -1.7 | 14 | 139 |
| 36 | database | 数据库 | 数据 | 227 | 0 | 3 | 384 | 39779 | -1.8 | 8 | 98 |
| 17 | tui | 终端 TUI | 交互 | 186 | 1 | 23 | 290 | 45285 | 0 | 12 | 28 |
| 47 | finance | 金融/行情 | 数据 | 171 | 0 | 5 | 392 | 16948 | -1.9 | 5 | 66 |

## FAMILY ROLLUP
> growth：n=5,639，覆盖 14.6%（全库 38,549，缺失 32,910；单快照样本信号，不可当全量结论）（growth med 仅基于有值样本，不可当全量结论）
- **媒体** (tags: 视频/分镜, 图像/绘图, 语音/音频, 屏幕感知, 视觉/多模态): repos=4291, ★med=0, weekly med=434, weekly sum=1023001, growth med=-1.9, new≤30d=1805
- **认知** (tags: 记忆, 人格/陪伴, 上下文/压缩): repos=4033, ★med=1, weekly med=441, weekly sum=1105911, growth med=-1.3, new≤30d=1793
- **知识** (tags: 知识库/RAG, 搜索/检索, 文档/笔记): repos=4826, ★med=0, weekly med=356, weekly sum=1337202, growth med=-0.8, new≤30d=2024
- **其他** (tags: 精选清单, 娱乐/游戏, 其他): repos=4261, ★med=0, weekly med=300, weekly sum=387366, growth med=0, new≤30d=1167
- **开发** (tags: 浏览器, 自动化, Shell/执行, Git/提交, 编码/代码, 文件/目录, 诊断/自检): repos=9894, ★med=0, weekly med=350, weekly sum=2259867, growth med=0, new≤30d=3681
- **连接** (tags: MCP, 远程/隧道): repos=2918, ★med=0, weekly med=389, weekly sum=715888, growth med=0, new≤30d=1078
- **平台** (tags: 移动端, 社交/IM, 插件市场, 安装/管理, 通知/提醒, 生产力/办公, 插件合集): repos=9311, ★med=0, weekly med=370, weekly sum=1956267, growth med=-0.5, new≤30d=3929
- **交互** (tags: 终端 TUI, 网页界面, 桌面客户端, 命令行, 会话管理, 工作区): repos=18522, ★med=0, weekly med=349, weekly sum=3559429, growth med=-0.6, new≤30d=7617
- **编排** (tags: 智能体, 工作流, 技能/Prompt): repos=9514, ★med=1, weekly med=352, weekly sum=1473694, growth med=-0.2, new≤30d=3547
- **模型** (tags: 模型接入, 路由/网关, 成本/额度): repos=7449, ★med=0, weekly med=343, weekly sum=1284115, growth med=-0.7, new≤30d=2779
- **数据** (tags: 统计/监控, 导出/归档, 数据库, 金融/行情): repos=3021, ★med=0, weekly med=346, weekly sum=443166, growth med=-0.9, new≤30d=1282
- **设计** (tags: 设计/排版, 中文本地化): repos=4564, ★med=0, weekly med=323, weekly sum=737294, growth med=-1.3, new≤30d=1859
- **安全** (tags: 安全): repos=1848, ★med=0, weekly med=295, weekly sum=279742, growth med=-1.3, new≤30d=702
- **基础设施** (tags: 框架/运行时): repos=1795, ★med=0, weekly med=257, weekly sum=1337335, growth med=0, new≤30d=557

## QUALITY GATE SELF-CHECK (issue #19)

> 门禁：排除 `archived=1` 与 `coverage<0.4`（低信号空壳）。注意 `row[12]=lowSignal` 用的是 coverage<0.5，与门禁阈值不同。

- 全库=38549 ｜ 归档=415 ｜ coverage<0.4=19524 ｜ 两者交集=219 ｜ 门禁排除合计=19720 ｜ 可入榜=18829
- 主榜自检：检查 60 行 → 归档入榜 0 ｜ 低信号入榜 0（必须为 0）

被门禁排除的最高分样本（证明门禁真实生效，不是空规则）：
  - [归档] perrylink/dsh-session-pin score=82.9 cov=1 wk=978
  - [归档] perrylink/dsh-background-agents score=82.8 cov=1 wk=858
  - [归档] howmp/dsh-pentest score=78.4 cov=1 wk=836
  - [低信号] 0xlucifereth/xhs-job-hunter score=55 cov=0.1 age=0d wk=null
  - [低信号] 18874530790/dsh-default-full-permission score=55 cov=0.1 age=2d wk=null
  - [低信号] 1997liuyh-boop/dsh-desktop-tools score=55 cov=0.1 age=6d wk=null

## FARM / DEDUP VIEW (issue #20)

> 农场阈值：单账号仓库数 > 100。去重视图按归一化 basename 聚类（去 `dsh-` / `plugin` / 版本 / 标点）；提供 `dedupView()` 与 `applyVerificationFilter()` 两种一键收敛方式。

- 农场账号=5 ｜ 农场仓库=1905 ｜ 全局 basename 重复簇=3346 ｜ 同作者近似名簇=49

农场分区（owner / 仓库数 / 有周下载数）：
  - uckkk: 1296 仓，其中 3 仓有下载
  - xby-skill: 187 仓，其中 0 仓有下载
  - perrylink: 181 仓，其中 137 仓有下载
  - feely0208: 136 仓，其中 29 仓有下载
  - omdsh-dev: 105 仓，其中 19 仓有下载

全局 basename 撞名 Top10（basename / 仓数 / 不同 owner 数 / 最高分）：
  - plugins: 740 仓, owners=740, score≤91.6 — e.g. klarkxy/dsh-plugins, delthin/dsh-plugins, zhiqiangme/dsh-plugins
  - desktop: 113 仓, owners=113, score≤74.9 — e.g. dataelement/dsh-desktop, anywhere-labs/dsh-desktop, vibeinging/dsh-desktop
  - memory: 94 仓, owners=94, score≤90.1 — e.g. max-null/dsh-memory, furongjun-1999/dsh-memory, annkun/dsh-memory
  - sessiondelete: 79 仓, owners=79, score≤76.8 — e.g. xrn1997/dsh-session-delete, linusteller/dsh-session-delete, xohmai/dsh-session-delete
  - pluginmanager: 74 仓, owners=74, score≤70 — e.g. liaoyuanxinghuo/dsh-plugin-manager, liqichen/dsh-plugin-manager, pelydeng/dsh-plugin-manager
  - pluginmarket: 72 仓, owners=72, score≤77.7 — e.g. losebird/dsh-plugin-market, 99galaxy/dsh-plugin-market, chnjames/dsh-plugin-market
  - deepseekharnessdesktop: 58 仓, owners=58, score≤74.9 — e.g. dsh-tauri/deepseek-harness-desktop, ningbainb/deepseek-harness-desktop, chokwinlee/deepseek-harness-desktop
  - notify: 55 仓, owners=55, score≤73.8 — e.g. bittersmilezzz/dsh-notify, linbin-mk/dsh-notify, yaorenliang/dsh-notify
  - pluginindex: 48 仓, owners=48, score≤79.2 — e.g. polang233/dsh-plugin-index, ymck-x/dsh-plugin-index, gitmfq/dsh-plugin-index
  - balance: 46 仓, owners=46, score≤70.8 — e.g. crazywoola/dsh-balance, yxxbc/dsh-balance-plugin, twotwopiggy/dsh-balance

同作者近似名 Top8：
  - kush-coder/autopiloteacdesktop: 7 仓, score≤54.6
  - uckkk/base: 6 仓, score≤48.7
  - perrylink/pluginupgrade: 3 仓, score≤58.7
  - eternalnight996/memoryeternal: 2 仓, score≤96.2
  - blank-not-black/remote: 2 仓, score≤92.9
  - hiai-gg/docsmint: 2 仓, score≤89.9
  - zseven-w/openpencil: 2 仓, score≤82.4
  - mrpulor-gh/nuphusmcp: 2 仓, score≤80.7

## VERIFICATION BADGES (issue #20)

| 徽章 | 含义 | 全库仓数 |
|---|---|---|
| ✅ 已验证 | 有周下载 + 有 star + 非农场 | 4564 |
| ⚠ 弱信号 | 仅有下载或仅有 star + 非农场 | 14146 |
| ⚠ 未验证 | 无下载、无 star、非农场 | 17934 |
| 🚫 农场 | 单账号仓库数 > 100 | 1905 |

一键过滤：`applyVerificationFilter(rows, ownerCounts, {requireDownloads:true, requireStars:false, excludeFarm:true})`；CLI：`node data/dedup.mjs --filter --downloads --no-farm --limit 20`。

## GROWTH QUALITY (issue #15)

> growth：n=5,639，覆盖 14.6%（全库 38,549，缺失 32,910；单快照样本信号，不可当全量结论）

- |growth|>100 的仓=150 ｜ 其中 |growth|>100 且 stars<100 标记为异常=145（不进增长榜）
- 原始极值 max=2607.4 / min=-94.4；异常判据：|row[4]|>100 且 row[2]<100
- 口径辨析：本字段是 raw=(latest−prev)/prev，无平滑先验；评分 velocity 用 (weekly−prev)/(prev+20) 且 prev<5 记 insufficient；告警 minPrev=20 是告警触发下限。三者不是同一个阈值（见 DATA-DICTIONARY.md §8）。

被排除的异常样本（score 高也不放行）：
  - lhwwxy/dsh-agentic-router growth=2607.4 ★=1 score=71.2
  - sweet560/dsh-plugin-deepseek-chat growth=2200 ★=1 score=75.4
  - eehcx/dsh-gentle-engram growth=1209.7 ★=1 score=65
  - having5548/dsh-downloader growth=1103.8 ★=0 score=71.5
  - ckarefulon/dsh-codespace-workspace growth=1070.2 ★=1 score=68.4

清洗后增长榜（正数、非异常，仍必须带覆盖率注记）：
  1. lijiaqi-ai-product-manager/dsh-agent-compare growth=951.5 ★=425 wk=92759
  2. ikalus1988/misakanet growth=257.4 ★=561 wk=4360
  3. toby-bridges/api-relay-audit growth=143.9 ★=914 wk=839
  4. zilliztech/memsearch growth=123.5 ★=2883 wk=13548
  5. qkycir-123/dsh-run2skill growth=122.9 ★=110 wk=994
  6. aladdinslamp/dsh-plugin-input-history growth=100 ★=1 wk=24
  7. khellendros97/dsh-launch growth=100 ★=1 wk=24
  8. yiyunet/dsh-chatgpt-connect growth=99.9 ★=0 wk=2133
  9. cnkang/qdrant-memory-mcp growth=99.8 ★=1 wk=1317
  10. c10ck-p/dsh-checkpoint-dock growth=99.8 ★=1 wk=949

## TOP 60 — MAIN BOARD (quality-gated, score-sorted)
> 排序仍是全局 score 降序（issue #12），但先经 issue #19 门禁剔除归档与 coverage<0.4 的空壳；`topByScore()` 保留为无门禁的参照函数。行尾徽章来自 issue #20 的 `verificationBadge()`。
1. lijiaqi-ai-product-manager/dsh-agent-compare | score=99.4 | ★=425 | wk=92759 | grow=951.5 | age=14d | seg=1 | cov=1 | enr=0 | ✅ 已验证 | tags=[网页界面,桌面客户端,会话管理,Git/提交]
2. zilliztech/memsearch | score=99.1 | ★=2883 | wk=13548 | grow=123.5 | age=280d | seg=5 | cov=1 | enr=0 | ✅ 已验证 | tags=[记忆,知识库/RAG,搜索/检索,文档/笔记]
3. tt-a1i/archify | score=98.8 | ★=96845 | wk=16124 | grow=40.3 | age=215d | seg=2 | cov=1 | enr=0 | ✅ 已验证 | tags=[图像/绘图,网页界面,编码/代码,智能体]
4. woniuniuniu/dsh-media-desk | score=98.8 | ★=1402 | wk=8119 | grow=74.1 | age=14d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[视频/分镜,工作区]
5. flymysql/dsh-remote | score=98.8 | ★=291 | wk=79516 | grow=76.8 | age=94d | seg=2 | cov=1 | enr=0 | ✅ 已验证 | tags=[搜索/检索,远程/隧道,工作区,Git/提交]
6. fourzkw/dsh-drawai | score=98.7 | ★=667 | wk=7817 | grow=92.4 | age=61d | seg=2 | cov=1 | enr=0 | ✅ 已验证 | tags=[图像/绘图,模型接入]
7. ikalus1988/misakanet | score=98.7 | ★=561 | wk=4360 | grow=257.4 | age=200d | seg=3 | cov=1 | enr=0 | ✅ 已验证 | tags=[记忆,MCP,Git/提交,编码/代码]
8. ebony-vinyl/dsh-our-free-model | score=98.4 | ★=76025 | wk=20708 | grow=25.7 | age=52d | seg=3 | cov=1 | enr=0 | ✅ 已验证 | tags=[模型接入,成本/额度,统计/监控]
9. t-auto/dsh-ops | score=98.4 | ★=5850 | wk=73476 | grow=26.9 | age=39d | seg=2 | cov=1 | enr=0 | ✅ 已验证 | tags=[自动化,成本/额度,统计/监控,设计/排版]
10. michengai/dsh-codex-ui | score=98.3 | ★=297 | wk=24226 | grow=41 | age=93d | seg=1 | cov=1 | enr=0 | ✅ 已验证 | tags=[搜索/检索,网页界面,会话管理,工作区]
11. ssamurias/dsh-fish | score=98 | ★=155 | wk=5620 | grow=92.1 | age=22d | seg=1 | cov=1 | enr=0 | ✅ 已验证 | tags=[人格/陪伴,文档/笔记,社交/IM,网页界面]
12. xdtrees/dsh-xdpool | score=97.7 | ★=531 | wk=4734 | grow=34.6 | age=73d | seg=7 | cov=1 | enr=0 | ✅ 已验证 | tags=[自动化,模型接入,路由/网关,成本/额度]
13. jialaoliu/dsh-baton | score=97.7 | ★=230 | wk=4372 | grow=83.5 | age=29d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[MCP,编码/代码,智能体,模型接入]
14. omdsh-dev/dsh-better-sidebar | score=97.6 | ★=5182 | wk=96487 | grow=11.8 | age=100d | seg=2 | cov=1 | enr=0 | 🚫 农场 | tags=[会话管理,工作区,Git/提交,文件/目录]
15. wnluo/dsh-mobile-plugin | score=97.6 | ★=61 | wk=58280 | grow=60 | age=36d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[远程/隧道,移动端]
16. dingminhua/dsh-connect-workbuddy | score=97.5 | ★=1649 | wk=34342 | grow=12.3 | age=79d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[模型接入,成本/额度,插件市场,安装/管理]
17. tranquillitatis-lab/dsh-live-compact | score=97.5 | ★=288 | wk=4146 | grow=37.5 | age=13d | seg=5 | cov=1 | enr=0 | ✅ 已验证 | tags=[上下文/压缩]
18. chromoany/dsh-notify-me | score=97.5 | ★=136 | wk=7531 | grow=40.9 | age=68d | seg=1 | cov=1 | enr=0 | ✅ 已验证 | tags=[网页界面,桌面客户端,通知/提醒]
19. songoao25/dsh-bottom-info-bar | score=97.5 | ★=61 | wk=20551 | grow=64.4 | age=93d | seg=7 | cov=1 | enr=0 | ✅ 已验证 | tags=[精选清单,网页界面,会话管理,模型接入]
20. duhu2000/dsh-mcp-connector | score=97.4 | ★=130 | wk=12624 | grow=29.4 | age=87d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[搜索/检索,MCP,模型接入,安全]
21. drscrewdriver/dsh-browser-cdp | score=97.4 | ★=45 | wk=9607 | grow=138.7 ⚠异常(未清洗) | age=54d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[视频/分镜,浏览器,远程/隧道,自动化]
22. ebony-vinyl/eac-design-world | score=97.2 | ★=1550 | wk=3538 | grow=46.3 | age=30d | seg=6 | cov=1 | enr=0 | ✅ 已验证 | tags=[视频/分镜,MCP,工作区,编码/代码]
23. dddmuc/dsh-free-search | score=97.2 | ★=1223 | wk=39301 | grow=10.1 | age=93d | seg=4 | cov=1 | enr=0 | ✅ 已验证 | tags=[搜索/检索,网页界面,模型接入,成本/额度]
24. poco-ai/agentero-dsh-plugin | score=97.2 | ★=227 | wk=4206 | grow=50 | age=17d | seg=4 | cov=1 | enr=0 | ✅ 已验证 | tags=[搜索/检索,文档/笔记,会话管理,智能体]
25. wsl043/dsh-codex-subscription | score=97.1 | ★=489 | wk=10764 | grow=13.8 | age=94d | seg=7 | cov=1 | enr=0 | ✅ 已验证 | tags=[图像/绘图,搜索/检索,远程/隧道,移动端]
26. aik358/dsh-auto-memory | score=97.1 | ★=202 | wk=3191 | grow=64.8 | age=94d | seg=5 | cov=1 | enr=0 | ✅ 已验证 | tags=[记忆,上下文/压缩,自动化,技能/Prompt]
27. fei2411/ds-bot | score=97 | ★=7958 | wk=21813 | grow=8.1 | age=39d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[智能体]
28. liguobao/ds-harness-remote | score=97 | ★=2986 | wk=30117 | grow=7.8 | age=93d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[远程/隧道,移动端,网页界面,工作区]
29. sirilee/dsh-rewind | score=97 | ★=273 | wk=14207 | grow=15.3 | age=91d | seg=6 | cov=1 | enr=0 | ✅ 已验证 | tags=[图像/绘图,知识库/RAG,会话管理,工作区]
30. orderg-x/dsh-design-studio | score=97 | ★=78 | wk=4931 | grow=49.3 | age=28d | seg=1 | cov=1 | enr=0 | ✅ 已验证 | tags=[图像/绘图,网页界面,桌面客户端,工作区]
31. saya-ch/dsh-mobile | score=96.9 | ★=862 | wk=8954 | grow=10.9 | age=93d | seg=1 | cov=1 | enr=0 | ✅ 已验证 | tags=[屏幕感知,远程/隧道,移动端,网页界面]
32. 2026heshao/dsh-armory | score=96.9 | ★=123 | wk=2913 | grow=60.8 | age=37d | seg=2 | cov=1 | enr=0 | ✅ 已验证 | tags=[MCP,网页界面,技能/Prompt,模型接入]
33. literaf/dsh-ai4scholar | score=96.8 | ★=49 | wk=3897 | grow=71.7 | age=92d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[搜索/检索,文档/笔记]
34. lishize20040802-rgb/dsh-deep-ptc-mode | score=96.8 | ★=48 | wk=5273 | grow=61.9 | age=19d | seg=1 | cov=1 | enr=0 | ✅ 已验证 | tags=[图像/绘图,上下文/压缩,远程/隧道,网页界面]
35. op7418/dsh-guizang-design | score=96.7 | ★=922 | wk=9039 | grow=25.8 | age=16d | seg=2 | cov=1 | enr=0 | ✅ 已验证 | tags=[网页界面,工作流,技能/Prompt,设计/排版]
36. nwflower/dsh-chat-import | score=96.7 | ★=315 | wk=5383 | grow=14.4 | age=94d | seg=6 | cov=1 | enr=0 | ✅ 已验证 | tags=[会话管理,自动化,编码/代码,文件/目录]
37. perrylink/dsh-auto-review | score=96.7 | ★=249 | wk=2071 | grow=76.6 | age=94d | seg=0 | cov=1 | enr=0 | 🚫 农场 | tags=[会话管理,自动化,Shell/执行,编码/代码]
38. topmindspace/dsh-super-kanban | score=96.7 | ★=107 | wk=2311 | grow=82.3 | age=11d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[会话管理,工作区,设计/排版,安装/管理]
39. liujiangnanchenjbguo/dsh-gufa-code | score=96.5 | ★=44 | wk=11085 | grow=44.2 | age=11d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[远程/隧道,会话管理,Git/提交,编码/代码]
40. hkkz9522/dsh-session-manager | score=96.4 | ★=122 | wk=3741 | grow=24.9 | age=92d | seg=6 | cov=1 | enr=0 | ✅ 已验证 | tags=[会话管理,工作区,智能体,导出/归档]
41. aa728848/dsh-chatgpt-subscription | score=96.4 | ★=98 | wk=6375 | grow=17.8 | age=94d | seg=3 | cov=1 | enr=0 | ✅ 已验证 | tags=[成本/额度]
42. xingxingbk-git/dsh-deepseek-chat | score=96.4 | ★=36 | wk=3333 | grow=113.9 ⚠异常(未清洗) | age=38d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[桌面客户端,会话管理,Git/提交,插件市场]
43. yu-tao-li/dsh-computer-use-win | score=96.3 | ★=752 | wk=10649 | grow=6.6 | age=91d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[MCP,桌面客户端,自动化]
44. mexiaosqwq/dsh-web-mobile | score=96.3 | ★=191 | wk=5244 | grow=13.6 | age=93d | seg=1 | cov=1 | enr=0 | ✅ 已验证 | tags=[移动端,网页界面,设计/排版]
45. hyhmrright/brooks-lint | score=96.2 | ★=1578 | wk=1563 | grow=50.7 | age=235d | seg=2 | cov=1 | enr=0 | ✅ 已验证 | tags=[命令行,Git/提交,编码/代码,智能体]
46. anionex/dsh-vision-toolkit | score=96.2 | ★=945 | wk=3184 | grow=12.9 | age=94d | seg=2 | cov=1 | enr=0 | ✅ 已验证 | tags=[图像/绘图,屏幕感知,视觉/多模态,网页界面]
47. eternalnight996/memory-eternal | score=96.2 | ★=189 | wk=5228 | grow=11.3 | age=77d | seg=5 | cov=1 | enr=0 | ✅ 已验证 | tags=[记忆,MCP,编码/代码,智能体]
48. liustack/modsearch | score=96.1 | ★=989 | wk=21924 | grow=4.6 | age=267d | seg=4 | cov=1 | enr=0 | ✅ 已验证 | tags=[搜索/检索,网页界面,编码/代码,智能体]
49. q253595422/dsh-imagegen-video | score=96.1 | ★=103 | wk=3176 | grow=19.4 | age=31d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[视频/分镜,图像/绘图,工作区,工作流]
50. asktheway/dsh-auto-memory | score=96 | ★=132 | wk=3609 | grow=15.2 | age=54d | seg=5 | cov=1 | enr=0 | ✅ 已验证 | tags=[记忆,文档/笔记,自动化,编码/代码]
51. aliboder/dsh-music-panel | score=95.9 | ★=32 | wk=20041 | grow=24.7 | age=11d | seg=1 | cov=1 | enr=0 | ✅ 已验证 | tags=[语音/音频,网页界面,工作区]
52. sixtysevenlf/dsh-blender-plugin | score=95.8 | ★=2122 | wk=4897 | grow=6.4 | age=63d | seg=2 | cov=1 | enr=0 | ✅ 已验证 | tags=[终端 TUI,桌面客户端,自动化,技能/Prompt]
53. microqian2th/dsh-codex-effort-slider | score=95.8 | ★=275 | wk=2851 | grow=12.9 | age=42d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[桌面客户端,模型接入]
54. perrylink/dsh-permission-rules | score=95.8 | ★=136 | wk=2221 | grow=30.5 | age=94d | seg=2 | cov=1 | enr=0 | 🚫 农场 | tags=[会话管理,工作区,Shell/执行,编码/代码]
55. songoao25/dsh-chatgpt-sub | score=95.8 | ★=50 | wk=2582 | grow=59.7 | age=92d | seg=7 | cov=1 | enr=0 | ✅ 已验证 | tags=[精选清单,会话管理,模型接入,成本/额度]
56. omdsh-dev/dsh-llm-fallbacks | score=95.8 | ★=26 | wk=3572 | grow=65.1 | age=100d | seg=3 | cov=1 | enr=0 | 🚫 农场 | tags=[智能体,模型接入]
57. slow-stack/mneme | score=95.7 | ★=235 | wk=3840 | grow=8.7 | age=94d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[记忆,知识库/RAG,搜索/检索,MCP]
58. drscrewdriver/dsh-prime-memory | score=95.7 | ★=33 | wk=7038 | grow=22.8 | age=76d | seg=5 | cov=1 | enr=0 | ✅ 已验证 | tags=[记忆,插件市场]
59. dingminhua/dsh-connect-qoder | score=95.6 | ★=68 | wk=5046 | grow=17.4 | age=36d | seg=0 | cov=1 | enr=0 | ✅ 已验证 | tags=[模型接入,路由/网关,成本/额度,插件市场]
60. perrylink/dsh-doublecheck | score=95.6 | ★=58 | wk=2109 | grow=66.9 | age=94d | seg=0 | cov=1 | enr=0 | 🚫 农场 | tags=[编码/代码,技能/Prompt,安全,插件市场]

## ENRICHED SAMPLES (row[10]=1, label + summary)
- **drscrewdriver/dsh-brief-sidebar** [score=93.4, cov=1]
  - 标签：工作区 / 插件市场 / 网页界面
  - 摘要：README/npm 关键词补全的能力标签：工作区 / 插件市场 / 网页界面；主赛道 其他；score 93.4，coverage 1。
  - owner：drscrewdriver ｜ license：未知 ｜ version：未知
- **openma-ai/deepseek-harness-acp** [score=90, cov=1]
  - 标签：智能体 / 框架/运行时 / MCP
  - 摘要：README/npm 关键词补全的能力标签：智能体 / 框架/运行时 / MCP；主赛道 框架/运行时；score 90，coverage 1。
  - owner：openma-ai ｜ license：未知 ｜ version：未知
- **perrylink/dsh-output-styles** [score=85.2, cov=1]
  - 标签：会话管理 / 编码/代码 / 技能/Prompt / 模型接入 / 导出/归档
  - 摘要：README/npm 关键词补全的能力标签：会话管理 / 编码/代码 / 技能/Prompt / 模型接入 / 导出/归档；主赛道 框架/运行时；score 85.2，coverage 1。
  - owner：perrylink ｜ license：未知 ｜ version：未知
- **cloader/dsh-taskboard** [score=78.2, cov=1]
  - 标签：智能体 / 生产力/办公 / 网页界面
  - 摘要：README/npm 关键词补全的能力标签：智能体 / 生产力/办公 / 网页界面；主赛道 其他；score 78.2，coverage 1。
  - owner：cloader ｜ license：未知 ｜ version：未知
- **kira905/dsh-task-board-local** [score=77.2, cov=1]
  - 标签：会话管理 / 生产力/办公 / 网页界面
  - 摘要：README/npm 关键词补全的能力标签：会话管理 / 生产力/办公 / 网页界面；主赛道 其他；score 77.2，coverage 1。
  - owner：kira905 ｜ license：未知 ｜ version：未知
- **firefox2100/dsh-ai-providers** [score=75.3, cov=1]
  - 标签：模型接入 / 图像/绘图
  - 摘要：README/npm 关键词补全的能力标签：模型接入 / 图像/绘图；主赛道 框架/运行时；score 75.3，coverage 1。
  - owner：firefox2100 ｜ license：未知 ｜ version：未知
- **skillnerds/xskill** [score=73.4, cov=0.5]
  - 标签：编码/代码 / 智能体 / 技能/Prompt / 网页界面
  - 摘要：README/npm 关键词补全的能力标签：编码/代码 / 智能体 / 技能/Prompt / 网页界面；主赛道 工具/开发体验；score 73.4，coverage 0.5。
  - owner：skillnerds ｜ license：未知 ｜ version：未知
- **jayyuen666/dsh-session-rescue** [score=72.8, cov=1]
  - 标签：会话管理 / 生产力/办公
  - 摘要：README/npm 关键词补全的能力标签：会话管理 / 生产力/办公；主赛道 其他；score 72.8，coverage 1。
  - owner：jayyuen666 ｜ license：未知 ｜ version：未知
- **gjj-star/dsh-conversation-navigator** [score=72.7, cov=1]
  - 标签：网页界面 / 会话管理 / 设计/排版 / 搜索/检索
  - 摘要：README/npm 关键词补全的能力标签：网页界面 / 会话管理 / 设计/排版 / 搜索/检索；主赛道 UI/客户端；score 72.7，coverage 1。
  - owner：gjj-star ｜ license：未知 ｜ version：未知
- **xi-kari/dsh-amphoreus** [score=72.1, cov=1]
  - 标签：工作区 / 搜索/检索
  - 摘要：README/npm 关键词补全的能力标签：工作区 / 搜索/检索；主赛道 框架/运行时；score 72.1，coverage 1。
  - owner：xi-kari ｜ license：未知 ｜ version：未知
- **lencx/minke** [score=71.9, cov=0.5]
  - 标签：桌面客户端 / 智能体 / 技能/Prompt / 浏览器
  - 摘要：README/npm 关键词补全的能力标签：桌面客户端 / 智能体 / 技能/Prompt / 浏览器；主赛道 框架/运行时；score 71.9，coverage 0.5。
  - owner：lencx ｜ license：未知 ｜ version：未知
- **zju-real/polaris** [score=70.9, cov=0.5]
  - 标签：智能体 / MCP
  - 摘要：README/npm 关键词补全的能力标签：智能体 / MCP；主赛道 其他；score 70.9，coverage 0.5。
  - owner：zju-real ｜ license：未知 ｜ version：未知
- **taxueseek/plugin-fast-adapt** [score=70.7, cov=0.5]
  - 标签：记忆 / 文档/笔记 / 编码/代码 / 智能体 / 网页界面
  - 摘要：README/npm 关键词补全的能力标签：记忆 / 文档/笔记 / 编码/代码 / 智能体 / 网页界面；主赛道 记忆/上下文；score 70.7，coverage 0.5。
  - owner：taxueseek ｜ license：未知 ｜ version：未知
- **icycreamdas/shidi-skill** [score=70.5, cov=1]
  - 标签：文档/笔记 / 编码/代码 / 文件/目录 / 智能体 / 导出/归档
  - 摘要：README/npm 关键词补全的能力标签：文档/笔记 / 编码/代码 / 文件/目录 / 智能体 / 导出/归档；主赛道 工具/开发体验；score 70.5，coverage 1。
  - owner：icycreamdas ｜ license：未知 ｜ version：未知
- **jerry2262/dsh-fingerprint** [score=68.2, cov=1]
  - 标签：模型接入 / 网页界面
  - 摘要：README/npm 关键词补全的能力标签：模型接入 / 网页界面；主赛道 框架/运行时；score 68.2，coverage 1。
  - owner：jerry2262 ｜ license：未知 ｜ version：未知
- **vonweller/dsh-skillhub** [score=67.5, cov=0.5]
  - 标签：技能/Prompt / MCP
  - 摘要：README/npm 关键词补全的能力标签：技能/Prompt / MCP；主赛道 工具/开发体验；score 67.5，coverage 0.5。
  - owner：vonweller ｜ license：未知 ｜ version：未知
- **sidleo/llm-wiki** [score=66.9, cov=0.5]
  - 标签：文档/笔记 / 智能体 / 模型接入 / MCP
  - 摘要：README/npm 关键词补全的能力标签：文档/笔记 / 智能体 / 模型接入 / MCP；主赛道 搜索/知识；score 66.9，coverage 0.5。
  - owner：sidleo ｜ license：未知 ｜ version：未知
- **anil-matcha/awesome-dsh-plugin** [score=66.8, cov=0.5]
  - 标签：精选清单 / 网页界面 / 命令行 / 编码/代码 / MCP
  - 摘要：README/npm 关键词补全的能力标签：精选清单 / 网页界面 / 命令行 / 编码/代码 / MCP；主赛道 工具/开发体验；score 66.8，coverage 0.5。
  - owner：anil-matcha ｜ license：未知 ｜ version：未知
- **xizhi1024/deepseek-harness-dsh-for-vscode** [score=66, cov=0.5]
  - 标签：工作区 / 编码/代码 / MCP
  - 摘要：README/npm 关键词补全的能力标签：工作区 / 编码/代码 / MCP；主赛道 框架/运行时；score 66，coverage 0.5。
  - owner：xizhi1024 ｜ license：未知 ｜ version：未知
- **zhang-jiazhi/dsh-prompt-optimizer** [score=65.6, cov=0.5]
  - 标签：技能/Prompt / 图像/绘图
  - 摘要：README/npm 关键词补全的能力标签：技能/Prompt / 图像/绘图；主赛道 框架/运行时；score 65.6，coverage 0.5。
  - owner：zhang-jiazhi ｜ license：未知 ｜ version：未知
- **gitroomhq/postiz-agent** [score=65, cov=1]
  - 标签：命令行 / 智能体 / 技能/Prompt / 模型接入 / MCP
  - 摘要：README/npm 关键词补全的能力标签：命令行 / 智能体 / 技能/Prompt / 模型接入 / MCP；主赛道 其他；score 65，coverage 1。
  - owner：gitroomhq ｜ license：未知 ｜ version：未知
- **lidongbei/dsh-session-view** [score=64.5, cov=0.6]
  - 标签：会话管理 / 网页界面
  - 摘要：README/npm 关键词补全的能力标签：会话管理 / 网页界面；主赛道 其他；score 64.5，coverage 0.6。
  - owner：lidongbei ｜ license：未知 ｜ version：未知
- **ghang/dsh-cache-helper** [score=64.1, cov=0.6]
  - 标签：会话管理 / 智能体 / 生产力/办公 / 诊断/自检 / 网页界面
  - 摘要：README/npm 关键词补全的能力标签：会话管理 / 智能体 / 生产力/办公 / 诊断/自检 / 网页界面；主赛道 记忆/上下文；score 64.1，coverage 0.6。
  - owner：ghang ｜ license：未知 ｜ version：未知
- **a1141171521/dsh-thinking-effort** [score=63.9, cov=0.5]
  - 标签：工作区 / 文件/目录 / 模型接入 / 网页界面
  - 摘要：README/npm 关键词补全的能力标签：工作区 / 文件/目录 / 模型接入 / 网页界面；主赛道 其他；score 63.9，coverage 0.5。
  - owner：a1141171521 ｜ license：未知 ｜ version：未知
- **wingoo/codex-plugin-dsh** [score=63.2, cov=0.5]
  - 标签：模型接入 / 图像/绘图
  - 摘要：README/npm 关键词补全的能力标签：模型接入 / 图像/绘图；主赛道 框架/运行时；score 63.2，coverage 0.5。
  - owner：wingoo ｜ license：未知 ｜ version：未知

## MATRIX (parent × capability cell counts)
parents: 智能体 | 会话管理 | 技能/Prompt | 工作区 | 模型接入
caps: 网页界面 | 桌面客户端 | 设计/排版 | 安装/管理 | 成本/额度 | 记忆 | MCP | 图像/绘图 | 工作流 | 插件市场 | 统计/监控 | 搜索/检索 | 路由/网关 | Git/提交 | 框架/运行时 | 安全
智能体: 网页界面=568, 桌面客户端=265, 设计/排版=180, 安装/管理=181, 成本/额度=98, 记忆=299, MCP=303, 图像/绘图=139, 工作流=349, 插件市场=199, 统计/监控=112, 搜索/检索=135, 路由/网关=140, Git/提交=148, 框架/运行时=224, 安全=169
会话管理: 网页界面=1190, 桌面客户端=410, 设计/排版=343, 安装/管理=279, 成本/额度=265, 记忆=316, MCP=111, 图像/绘图=239, 工作流=133, 插件市场=124, 统计/监控=246, 搜索/检索=205, 路由/网关=83, Git/提交=172, 框架/运行时=121, 安全=94
技能/Prompt: 网页界面=271, 桌面客户端=109, 设计/排版=135, 安装/管理=148, 成本/额度=43, 记忆=66, MCP=170, 图像/绘图=71, 工作流=111, 插件市场=194, 统计/监控=42, 搜索/检索=68, 路由/网关=51, Git/提交=58, 框架/运行时=68, 安全=96
工作区: 网页界面=668, 桌面客户端=243, 设计/排版=157, 安装/管理=151, 成本/额度=104, 记忆=56, MCP=73, 图像/绘图=131, 工作流=67, 插件市场=75, 统计/监控=94, 搜索/检索=111, 路由/网关=28, Git/提交=152, 框架/运行时=43, 安全=40
模型接入: 网页界面=733, 桌面客户端=205, 设计/排版=205, 安装/管理=157, 成本/额度=390, 记忆=97, MCP=137, 图像/绘图=212, 工作流=120, 插件市场=145, 统计/监控=186, 搜索/检索=156, 路由/网关=332, Git/提交=78, 框架/运行时=137, 安全=172

## HEAT (tag weekly volume trend, last 26 weeks)
网页界面 (total=8642): 0,2,0,1,0,1,0,2,3,2,5,14,1688,1199,553,320,349,279,287,367,315,472,703,592,831,657
会话管理 (total=7860): 0,2,0,5,1,0,0,3,1,2,5,14,1032,825,376,249,262,237,277,386,341,515,814,780,911,822
智能体 (total=6283): 5,12,6,12,16,12,6,14,13,17,16,38,1109,748,392,241,220,216,209,235,243,382,500,506,575,540
模型接入 (total=5393): 1,2,2,5,3,1,0,3,4,5,4,14,845,686,349,222,179,174,212,250,243,347,505,442,494,401
工作区 (total=4273): 2,0,0,3,1,1,0,1,2,1,3,5,465,368,218,121,105,124,133,182,189,257,433,458,643,558
桌面客户端 (total=3978): 0,2,1,2,4,3,0,1,0,3,2,11,777,451,177,113,139,116,136,223,183,249,388,334,351,312
设计/排版 (total=3930): 1,1,1,2,0,2,1,2,2,0,12,9,692,512,215,114,124,90,126,190,172,234,387,306,416,319
编码/代码 (total=3508): 3,8,3,8,11,6,7,11,10,9,22,29,660,429,230,126,112,112,127,131,146,196,273,235,317,287
技能/Prompt (total=3180): 3,8,4,5,6,6,3,7,9,8,18,16,452,339,333,105,112,112,102,127,113,192,257,258,280,305
安装/管理 (total=2989): 0,1,0,2,0,0,0,0,0,1,1,7,537,389,177,121,111,76,117,123,122,169,261,240,285,249
文件/目录 (total=2753): 1,1,1,4,1,0,1,0,0,3,2,9,424,294,141,103,91,85,80,124,124,174,253,282,312,243
文档/笔记 (total=2678): 2,6,3,7,7,2,3,4,1,3,5,17,366,272,156,88,97,80,99,116,111,146,240,240,328,279
插件市场 (total=2449): 0,1,0,1,0,2,0,0,2,2,3,7,418,371,146,82,66,58,66,100,88,137,195,181,288,235
搜索/检索 (total=2150): 0,2,0,2,1,1,1,1,5,2,2,7,353,242,153,79,58,56,54,81,77,147,204,196,223,203
成本/额度 (total=2147): 0,0,0,0,0,0,0,0,2,0,0,3,374,284,118,51,63,60,76,103,102,127,181,176,235,192
图像/绘图 (total=2016): 0,2,1,0,3,2,0,4,2,1,6,6,377,252,124,55,91,55,56,99,88,110,161,152,203,166
MCP (total=1903): 2,8,5,4,3,5,7,11,13,10,10,17,261,185,184,62,50,51,52,78,80,141,161,147,138,218
安全 (total=1838): 0,1,1,0,0,0,0,0,1,0,1,4,322,207,103,85,44,75,59,61,69,153,161,173,165,153

## DOWNLOAD TOP 30
> growth：n=5,639，覆盖 14.6%（全库 38,549，缺失 32,910；单快照样本信号，不可当全量结论）；高下载+负增长按 issue #22 标注为「存量留存风险」。
1. deepseek-ai/deepseek-harness wk=1208788 ★=281724 grow=-9.1
2. dsh-market/dsh-market wk=293468 ★=12542 grow=-11.7
3. bowenliang123/dsh-context wk=133085 ★=5149 grow=-9.4
4. awesome-dsh-plugin/awesome-dsh-plugin wk=103410 ★=24798 grow=-0.6
5. omdsh-dev/dsh-better-sidebar wk=96487 ★=5182 grow=11.8
6. pc2005-cloud/dsh-pet wk=95892 ★=6327 grow=-33.4
7. lijiaqi-ai-product-manager/dsh-agent-compare wk=92759 ★=425 grow=951.5
8. flymysql/dsh-remote wk=79516 ★=291 grow=76.8
9. t-auto/dsh-ops wk=73476 ★=5850 grow=26.9
10. liustack/modlens wk=70692 ★=4984 grow=-7.4
11. wnluo/dsh-mobile-plugin wk=58280 ★=61 grow=60
12. meteornox/deepseek-balance-whale-widget wk=50556 ★=7247 grow=-41.8
13. kenryu42/cc-safety-net wk=49920 ★=2053 grow=0.6
14. hellohub1212/dsh-windows-mcp wk=41368 ★=1352 grow=-94.4
15. dddmuc/dsh-free-search wk=39301 ★=1223 grow=10.1
16. han-1413141/dsh-cost-meter wk=38681 ★=703 grow=-2.5
17. michengai/dsh-skills-manager wk=37213 ★=574 grow=-26.7
18. dingminhua/dsh-connect-workbuddy wk=34342 ★=1649 grow=12.3
19. omdsh-dev/dsh-mnemon wk=32930 ★=1015 grow=-10.4
20. suifei/dsh-ai-team wk=32083 ★=25 grow=null
