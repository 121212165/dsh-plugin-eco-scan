#!/usr/bin/env node
/**
 * Heat 全量审计与断点处理（issue #14）：
 *  - 输出全部 50 个标签，未入选 meta.heat 的标签显式标注，绝不静默缺席；
 *  - 声明「采集起始周」，断点前的 0 视为「无数据」而非真实 0；
 *  - 趋势只使用断点后的窗口（last4 vs prev4），基期为 0 时不计算倍数。
 *
 *   node data/heat.mjs                              # 写 data/reports/HEAT-AUDIT.md
 *   node data/heat.mjs --start-week 2026-08-10      # 显式指定采集起始周
 *   node data/heat.mjs --stdout                     # 只打印，不写文件
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'eco-data.json');
const OUT = path.join(ROOT, 'data', 'reports', 'HEAT-AUDIT.md');
const CALLOUT = [47, 36, 34, 35]; // 金融 / 数据库 / 统计 / 导出：不得静默缺席

const argv = process.argv.slice(2);
let startWeek = '2026-08-10';
let toStdout = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--start-week') startWeek = argv[++i];
  else if (argv[i] === '--stdout') toStdout = true;
}

const D = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const M = D.meta;
const weeks = M.weeks || [];
const tags = M.tags || [];
const heat = M.heat || [];
const heatById = new Map(heat.map(h => [h.tag, h]));
const laneById = new Map((M.lanes || []).map(l => [l.tag, l]));
const nameOf = i => tags[i]?.name ?? `tag${i}`;
const famOf = i => tags[i]?.fam ?? '?';
const startIdx = weeks.indexOf(startWeek);
if (startIdx < 0) throw new Error(`采集起始周 ${startWeek} 不在 meta.weeks 中`);
const preWeeks = weeks.slice(0, startIdx);
const postWeeks = weeks.slice(startIdx);

const sum = a => a.reduce((x, y) => x + y, 0);
function postTrend(cells) {
  const post = cells.slice(startIdx);
  if (post.length < 8) return '窗口不足(需≥8周)';
  const prev4 = sum(post.slice(-8, -4)) / 4;
  const last4 = sum(post.slice(-4)) / 4;
  if (prev4 === 0) return '基期为0(无数据)→不算倍数';
  return `${(last4 / prev4).toFixed(2)}x (近4周${last4.toFixed(0)} / 前4周${prev4.toFixed(0)})`;
}

let out = '# HEAT 全量审计（50 标签）\n\n';
out += `> 数据快照日期：${M.date}（data/eco-data.json → meta.date）\n`;
out += '> 数据来源：eco-report-2026-11-06 / index.html:165 window.__DATA__（本库 data/eco-data.json）\n';
out += `> 采集起始周：${startWeek}（meta.weeks[${startIdx}]）；断点前的 0 = 无数据，不是真实 0\n`;
out += '> 趋势判断：不可做严格趋势（velocity 全空；heat 断点前窗口视为无数据）\n';
out += '> 复算：node data/heat.mjs [--start-week YYYY-MM-DD]\n\n';

out += '## 1. 结论摘要\n\n';
out += `- meta.heat 只覆盖 **${heat.length}/${tags.length}** 个标签；**${tags.length - heat.length}** 个未入选，其中金融(47)、数据库(36)、统计(34)、导出(35) **不得静默缺席**（见 §4）。\n`;
out += `- 结构性断点：前 ${startIdx} 周（${preWeeks[0]} ~ ${preWeeks.at(-1)}）合计仅占各标签总量极小比例；第 ${startIdx + 1} 周（${startWeek}）单周突跳。见 §2。\n`;
out += `- 采集起始周 **${startWeek}** 为本脚本依数据形态声明，**真实日期仍需数据提供方确认**（遗留风险）。\n`;
out += `- 所有趋势只用断点后 ${postWeeks.length} 周窗口；基期为 0 时不计算「回升倍数」。\n\n`;

out += '## 2. 断点证据（18 个入选标签）\n\n';
out += '| 标签 | total | 前12周合计 | 占总量的比 | 第13周 | 跳峰相对前12周均值 |\n';
out += '|---|---|---|---|---|---|\n';
for (const h of [...heat].sort((a, b) => b.total - a.total)) {
  const pre = sum(h.cells.slice(0, 12));
  const pctv = h.total ? (100 * pre / h.total).toFixed(2) : '0';
  const base = pre / 12;
  const jump = base > 0 ? `${(h.cells[12] / base).toFixed(0)}x` : '∞(前段无数据)';
  out += `| ${nameOf(h.tag)} | ${h.total} | ${pre} | ${pctv}% | ${h.cells[12]} | ${jump} |\n`;
}

out += '\n## 3. 全 50 标签覆盖表（未入选显式标注）\n\n';
out += '| id | 标签 | 族 | 在 meta.heat | heat total | lanes weeklySum | 断点前(无数据) | 断点后周数 | 断点后趋势 |\n';
out += '|---|---|---|---|---|---|---|---|---|\n';
for (let i = 0; i < tags.length; i++) {
  const h = heatById.get(i);
  const lane = laneById.get(i);
  const inHeat = h ? '是' : (lane ? '否（lanes 有周下载）' : '否（无周序列）');
  const total = h ? h.total : '—';
  const wk = lane?.weeklySum != null ? lane.weeklySum : '—';
  const pre = h ? `${sum(h.cells.slice(0, startIdx))}（视为无数据）` : '—';
  const postN = h ? h.cells.slice(startIdx).length : '—';
  const trend = h ? postTrend(h.cells) : '无周序列，不可计算';
  const flag = CALLOUT.includes(i) ? ' ⚠不得静默缺席' : '';
  out += `| ${i} | ${nameOf(i)}${flag} | ${famOf(i)} | ${inHeat} | ${total} | ${wk} | ${pre} | ${postN} | ${trend} |\n`;
}

out += '\n## 4. 未入选标签（32 个，含 4 个重点标签）\n\n';
const missing = tags.map((_, i) => i).filter(i => !heatById.has(i));
for (const i of missing) {
  const lane = laneById.get(i);
  const highlight = CALLOUT.includes(i) ? ' **重点：不得静默缺席**' : '';
  out += `- ${i} ${nameOf(i)}（${famOf(i)}）${highlight}：${lane ? `lanes.weeklySum=${lane.weeklySum}，repos=${lane.repos}` : 'lanes 也无记录，完全无周序列'}；结论：不是「冷」，而是未进入 heat 输出。\n`;
}

out += '\n## 5. 复算与判据\n\n';
out += `- 采集起始周索引 = meta.weeks.indexOf('${startWeek}') = ${startIdx}。\n`;
out += `- 断点前 ${preWeeks.length} 周全部视为「无数据」（保留原始 0 仅作证据，不参与任何趋势计算）。\n`;
out += `- 趋势窗口 = meta.weeks[${startIdx}..]（${postWeeks.length} 周）：近 4 周均值 ÷ 前 4 周均值；前 4 周为 0 时输出「基期为0(无数据)→不算倍数」，避免拿近乎 0 的基期伪造高倍数。\n`;
out += '- 报告模板 `data/reports/_TEMPLATE.md` 要求写「采集起始周」；agent 不得复述断点前的 0 为真实 0。\n';

if (toStdout) process.stdout.write(out);
else { fs.writeFileSync(OUT, out); console.log(`wrote ${path.relative(ROOT, OUT)} (${out.length} chars); startWeek=${startWeek} idx=${startIdx}; heat=${heat.length}/${tags.length}`); }
