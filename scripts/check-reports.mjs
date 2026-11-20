#!/usr/bin/env node
/**
 * 轻量质量门禁（issue #10）：检查报告数、必备章节标题、推荐表行数；失败报错退出。
 *
 *   node scripts/check-reports.mjs --wave 1            # 校验 task1/A1..A10
 *   node scripts/check-reports.mjs --wave 2            # 校验 task2/E1..E5
 *   node scripts/check-reports.mjs --wave all          # 两波都校验
 *   node scripts/check-reports.mjs --wave 1 --synth    # 追加校验报告一综合稿
 *   node scripts/check-reports.mjs --wave 1 --dir <dir> --ids A1,A2   # 用样例验证报错
 *
 * 与 runbook 联动：门禁不通过不得进入下一波。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function args(argv) {
  const out = { wave: 'all', minRows: 1, synth: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wave') out.wave = argv[++i];
    else if (a === '--dir') out.dir = argv[++i];
    else if (a === '--ids') out.ids = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--min-rows') out.minRows = Number(argv[++i]);
    else if (a === '--synth') out.synth = true;
    else if (a === '--help' || a === '-h') { console.log('usage: node scripts/check-reports.mjs --wave 1|2|all [--synth] [--dir D] [--ids A1,A2] [--min-rows N]'); process.exit(0); }
    else throw new Error(`unknown arg: ${a}`);
  }
  return out;
}

const WAVES = {
  1: {
    dir: 'data/reports/task1',
    ids: Array.from({ length: 10 }, (_, i) => `A${i + 1}`),
    synth: 'REPORT-1-synthesis.md',
    recHeading: /推荐开发清单/,
    headings: [/执行摘要|一句话|结论/, /口径|数据说明|方法/],
  },
  2: {
    dir: 'data/reports/task2',
    ids: Array.from({ length: 5 }, (_, i) => `E${i + 1}`),
    synth: 'REPORT-2-synthesis.md',
    recHeading: /推荐开发清单|可执行开发建议|开发建议|需求清单/,
    headings: [/执行摘要|一句话|结论/, /口径|数据说明|方法|信号/],
  },
};

let failures = 0;
function check(ok, label, detail = '') {
  if (ok) console.log(`  [PASS] ${label}`);
  else { console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

function reportBody(lines, headingIdx) {
  const m = lines[headingIdx].match(/^(#{1,6})\s/);
  const level = m ? m[1].length : 1;
  const out = [];
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6})\s/);
    if (h && h[1].length <= level) break;
    out.push(lines[i]);
  }
  return out;
}

function recommendationEntries(section) {
  // 既接受 markdown 表格数据行，也接受「建议 A / 1. …」式的清单条目（现有 E2/E5 即此类）。
  const tableLines = section.filter(l => /^\s*\|/.test(l));
  const nonSep = tableLines.filter(l => !/^\s*\|[\s:|-]+\|\s*$/.test(l));
  const tableRows = Math.max(0, nonSep.length - 1); // 去掉表头
  const listItems = section.filter(l => /^\s*(?:[-*+]\s+|\d+[.)]\s+|###\s+建议)/.test(l)).length;
  return Math.max(tableRows, listItems);
}

function checkFile(file, cfg, minRows) {
  const label = path.basename(file);
  if (!fs.existsSync(file)) { check(false, `${label} 存在`, '文件缺失'); return; }
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) { check(false, `${label} 非空`); return; }
  const lines = text.split(/\r?\n/);
  check(/^#\s+\S/.test(text), `${label} 含 H1 标题`);

  for (const re of cfg.headings) {
    check(lines.some(l => re.test(l)), `${label} 必备章节 /${re.source}/`);
  }

  const recIdx = lines.findIndex(l => cfg.recHeading.test(l));
  check(recIdx >= 0, `${label} 含推荐表章节 /${cfg.recHeading.source}/`);
  if (recIdx >= 0) {
    const rows = recommendationEntries(reportBody(lines, recIdx));
    check(rows >= minRows, `${label} 推荐表/清单条目 >= ${minRows}`, `实际 ${rows}`);
  }
}

const opts = args(process.argv.slice(2));
const selected = opts.wave === 'all' ? [1, 2] : [Number(opts.wave)];
for (const w of selected) {
  const base = WAVES[w];
  if (!base) throw new Error(`unknown wave: ${w}`);
  const dir = path.resolve(ROOT, opts.dir || base.dir);
  const ids = opts.ids || base.ids;
  console.log(`== wave ${w}: ${dir} (${ids.length} 份) ==`);
  check(fs.existsSync(dir), `目录存在 ${path.relative(ROOT, dir)}`);
  if (opts.ids) console.log('  [INFO] 使用自定义 --ids，跳过默认数量校验（负向样例用）');
  else check(ids.length === base.ids.length, `报告数量 = ${base.ids.length}`, `实际 ${ids.length}`);
  for (const id of ids) checkFile(path.join(dir, `${id}.md`), base, opts.minRows);
  if (opts.synth) {
    checkFile(path.join(dir, base.synth), { headings: [/执行摘要|共识/], recHeading: /推荐|清单/, ids: [] }, opts.minRows);
  }
}

console.log('');
if (failures > 0) { console.log(`FAILED: ${failures} 项门禁未通过`); process.exit(1); }
console.log('ALL GATES PASSED');
