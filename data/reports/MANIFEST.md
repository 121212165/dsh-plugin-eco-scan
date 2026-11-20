# 报告登记清单（MANIFEST）

> 每次新增/重生成报告后必须在此登记，避免并发写冲突与产物丢失（issue #21）。
> 「日期」列为报告使用的**数据快照日期**（`data/eco-data.json → meta.date`）；报告生成日期以 git 历史为准。
> 权威路径见 `data/AGENT_BRIEF.md`「共享文档」章节；契约见同文件「领域扫描（D1–Dn）」章节。

## Wave 1 · 当前需求（10 份）

| Agent | 领域 / 主题 | 日期 | 文件 |
|---|---|---|---|
| A1 | 全局需求综合 | 2026-11-16 | `data/reports/task1/A1.md` |
| A2 | 媒体族 | 2026-11-16 | `data/reports/task1/A2.md` |
| A3 | 认知 + 知识族 | 2026-11-16 | `data/reports/task1/A3.md` |
| A4 | 连接 + 平台族 | 2026-11-16 | `data/reports/task1/A4.md` |
| A5 | 交互族 | 2026-11-16 | `data/reports/task1/A5.md` |
| A6 | 开发族 | 2026-11-16 | `data/reports/task1/A6.md` |
| A7 | 编排族 | 2026-11-16 | `data/reports/task1/A7.md` |
| A8 | 模型 + 数据族 | 2026-11-16 | `data/reports/task1/A8.md` |
| A9 | 设计 + 安全 + 基础设施 | 2026-11-16 | `data/reports/task1/A9.md` |
| A10 | 空白 / 缺口 / 蓝海 | 2026-11-16 | `data/reports/task1/A10.md` |
| — | 报告一综合（共识排名 + 推荐清单 + 红海黑名单） | 2026-11-16 | `data/reports/task1/REPORT-1-synthesis.md` |

## Wave 2 · 企业未满足需求（5 份）

| Agent | 领域 / 主题 | 日期 | 文件 |
|---|---|---|---|
| E1 | 企业安全 / 合规 / 成本治理 | 2026-11-16 | `data/reports/task2/E1.md` |
| E2 | 企业数据与知识管理 | 2026-11-16 | `data/reports/task2/E2.md` |
| E3 | 企业流程编排与协作 | 2026-11-16 | `data/reports/task2/E3.md` |
| E4 | 企业集成 / 网关 / 平台治理 | 2026-11-16 | `data/reports/task2/E4.md` |
| E5 | 生产力协作 / 通知触达 / 本地化与设计规范 | 2026-11-16 | `data/reports/task2/E5.md` |
| — | 报告二综合（企业需求共识 + 价值主张对照） | 2026-11-16 | `data/reports/task2/REPORT-2-synthesis.md` |

## 领域扫描（D1–Dn）

| Agent | 领域 | 日期 | 文件 |
|---|---|---|---|
| D1 | 教育 / 学术 | 2026-11-16 | `data/reports/domains/D1.md` |
| D2 | 医疗健康 | 2026-11-16 | `data/reports/domains/D2.md` |
| D3 | 金融 / 投研 | 2026-11-16 | `data/reports/domains/D3.md` |
| D4 | 政企 / 合规 | 2026-11-16 | `data/reports/domains/D4.md` |
| D5 | 内容创作 / 游戏娱乐 | 2026-11-16 | `data/reports/domains/D5.md` |

## 汇总与元文档

| 类型 | 说明 | 日期 | 文件 |
|---|---|---|---|
| 总结 | 两份报告交叉验证 + 路线图 | 2026-11-16 | `data/reports/FINAL-SUMMARY.md` |
| 复盘 | 已发现的 7 条问题（RETRO） | 2026-11-16 | `data/reports/RETRO.md` |
| 模板 | 报告元数据块与章节模板 | — | `data/reports/_TEMPLATE.md` |
| 登记 | 本文件 | — | `data/reports/MANIFEST.md` |
| 派生报告 | heat 全 50 标签审计（由 `data/heat.mjs` 生成） | 2026-11-16 | `data/reports/HEAT-AUDIT.md`（#14 生成后登记） |

> 派生报告 `HEAT-AUDIT.md` 由第三批 #14 的 `data/heat.mjs` 生成并登记；若尚未生成，以脚本输出为准。
