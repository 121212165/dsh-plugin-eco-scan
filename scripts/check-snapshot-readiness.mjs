#!/usr/bin/env node
/**
 * 快照可用性门禁（issue #11）：分析前检查是否有 2–3 期可比较快照。
 *   退出码 0 = 可做趋势判断；2 = 不可做（报告必须写「不可做趋势判断」）。
 *
 *   node scripts/check-snapshot-readiness.mjs
 *   node scripts/check-snapshot-readiness.mjs data/eco-data.json --min-overlap 3
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
let dataPath = path.join(ROOT, 'data', 'eco-data.json');
let minOverlap = 2; // 至少两期才能做一次比较；推荐 3 期
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--min-overlap') minOverlap = Number(argv[++i]);
  else if (!argv[i].startsWith('--')) dataPath = path.resolve(argv[i]);
}

const D = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const M = D.meta;
const v = M.counts?.velocity ?? M.velocity ?? {};
const weeks = M.weeks ?? [];

console.log(`snapshot date      : ${M.date}`);
console.log(`velocity.prevDate  : ${v.prevDate ?? 'null'}`);
console.log(`velocity.days      : ${v.days ?? 'null'}`);
console.log(`velocity.overlap   : ${v.overlap ?? 'null'} (需要 >= ${minOverlap})`);
console.log(`velocity.note      : ${v.note ?? '—'}`);
console.log(`meta.weeks         : ${weeks.length} 周（heat 聚合周，非扫描快照数）`);

const usable = v.prevDate != null && Number.isFinite(v.days) && v.days > 0 && Number(v.overlap) >= minOverlap;
if (usable) {
  console.log('VERDICT: 可做趋势判断（但仍须遵守 data/DATA-DICTIONARY.md 的 heat 断点规则）');
  process.exit(0);
}
console.log('VERDICT: 不可做趋势判断 —— 报告必须写明此标记，所有增长数字仅作单快照方向参考。');
console.log('建议：按 data/runbook.md 第 0 步配置每日快照，积累 >= 2–3 期后补跑 /eco-calibrate。');
process.exit(2);
