/** Plugin-farm / duplicate-cluster controls — issue #20.
 *
 *  Two distinct views are provided because the observed pollution has two
 *  shapes: (a) one owner holding >100 repos (a "farm"), and (b) many owners
 *  shipping the same basename (`dsh-purge`, `dsh-plugin-guard`, ...).
 *
 *  `normaliseBase` is deliberately conservative: strip only `dsh-` / `plugin-`
 *  prefixes, trailing `-plugin`, version suffixes and punctuation. "Similar
 *  name" therefore means "same normalised basename", which is reproducible.
 */
import { ROW } from './schema.mjs';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

export const FARM_OWNER_THRESHOLD = 100;

export function normaliseBase(id) {
  return String(id ?? '')
    .split('/').pop().toLowerCase()
    .replace(/^(dsh-|plugin-)/, '')
    .replace(/[-_]?plugin$/, '')
    .replace(/[-_]?v?\d+(\.\d+)*$/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function countOwners(rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r[ROW.OWNER], (counts.get(r[ROW.OWNER]) ?? 0) + 1);
  return counts;
}

export function isFarmRow(row, ownerCounts = new Map()) {
  return (ownerCounts.get(row[ROW.OWNER]) ?? 0) > FARM_OWNER_THRESHOLD;
}

/** Group by normalised basename across all owners (name-collision view). */
export function basenameClusters(rows, min = 2) {
  const groups = new Map();
  for (const r of rows) {
    const b = normaliseBase(r[ROW.ID]);
    if (!b) continue;
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(r);
  }
  return [...groups.entries()]
    .filter(([, v]) => v.length >= min)
    .map(([basename, members]) => ({
      basename,
      n: members.length,
      owners: new Set(members.map((r) => r[ROW.OWNER])).size,
      maxScore: Math.max(...members.map((r) => r[ROW.SCORE] ?? 0)),
      examples: members.slice(0, 3).map((r) => r[ROW.ID]),
    }))
    .sort((a, b) => b.n - a.n);
}

/** Group by owner + normalised basename (issue #20's "same author + similar name"). */
export function sameOwnerClusters(rows, min = 2) {
  const groups = new Map();
  for (const r of rows) {
    const b = normaliseBase(r[ROW.ID]);
    if (!b) continue;
    const k = `${r[ROW.OWNER]}|${b}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.entries()]
    .filter(([, v]) => v.length >= min)
    .map(([key, members]) => {
      const [owner, basename] = key.split('|');
      return {
        owner, basename, n: members.length,
        maxScore: Math.max(...members.map((r) => r[ROW.SCORE] ?? 0)),
        examples: members.slice(0, 3).map((r) => r[ROW.ID]),
      };
    })
    .sort((a, b) => b.n - a.n);
}

/** Deduplicated view: one representative (highest score) per basename cluster. */
export function dedupView(rows, min = 2) {
  const groups = new Map();
  for (const r of rows) {
    const b = normaliseBase(r[ROW.ID]);
    if (!b) continue;
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(r);
  }
  const out = [];
  for (const [basename, members] of groups) {
    const sorted = [...members].sort((a, b) => b[ROW.SCORE] - a[ROW.SCORE]);
    out.push({
      basename,
      n: sorted.length,
      duplicate: sorted.length >= min,
      representative: sorted[0],
      hidden: sorted.slice(1),
    });
  }
  return out.sort((a, b) => b.representative[ROW.SCORE] - a.representative[ROW.SCORE]);
}

/** Verification badge — supports one-click filtering via applyVerificationFilter. */
export function verificationBadge(row, ownerCounts = new Map()) {
  const hasDownloads = (row[ROW.WEEKLY] ?? 0) > 0;
  const hasStars = (row[ROW.STARS] ?? 0) > 0;
  const nonFarm = !isFarmRow(row, ownerCounts);
  let level, label;
  if (!nonFarm) { level = 'farm'; label = '🚫 农场'; }
  else if (hasDownloads && hasStars) { level = 'verified'; label = '✅ 已验证'; }
  else if (hasDownloads || hasStars) { level = 'weak'; label = '⚠ 弱信号'; }
  else { level = 'unverified'; label = '⚠ 未验证'; }
  return { hasDownloads, hasStars, nonFarm, level, label };
}

/** One-click filter used by the CLI and by consumers of the main board. */
export function applyVerificationFilter(rows, ownerCounts = new Map(), opts = {}) {
  const { requireDownloads = true, requireStars = false, excludeFarm = true } = opts;
  return rows.filter((r) => {
    const b = verificationBadge(r, ownerCounts);
    if (excludeFarm && !b.nonFarm) return false;
    if (requireDownloads && !b.hasDownloads) return false;
    if (requireStars && !b.hasStars) return false;
    return true;
  });
}

export function dedupStats(rows) {
  const owners = countOwners(rows);
  const farms = [...owners.entries()]
    .filter(([, n]) => n > FARM_OWNER_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([owner, n]) => ({ owner, n, weeklyPositive: rows.filter((r) => r[ROW.OWNER] === owner && (r[ROW.WEEKLY] ?? 0) > 0).length }));
  return {
    farmOwners: farms.length,
    farmRows: rows.filter((r) => isFarmRow(r, owners)).length,
    farms,
    basenameClusters: basenameClusters(rows).length,
    sameOwnerClusters: sameOwnerClusters(rows).length,
  };
}

export function renderDedup(rows) {
  const owners = countOwners(rows);
  const s = dedupStats(rows);
  const baseTop = basenameClusters(rows).slice(0, 10);
  const ownTop = sameOwnerClusters(rows).slice(0, 8);
  const badges = rows.reduce((m, r) => { const b = verificationBadge(r, owners); m[b.level] = (m[b.level] ?? 0) + 1; return m; }, {});
  const lines = [
    '## FARM / DEDUP VIEW (issue #20)',
    '',
    `> 农场阈值：单账号仓库数 > ${FARM_OWNER_THRESHOLD}。去重视图按归一化 basename 聚类（去 \`dsh-\` / \`plugin\` / 版本 / 标点）；提供 \`dedupView()\` 与 \`applyVerificationFilter()\` 两种一键收敛方式。`,
    '',
    `- 农场账号=${s.farmOwners} ｜ 农场仓库=${s.farmRows} ｜ 全局 basename 重复簇=${s.basenameClusters} ｜ 同作者近似名簇=${s.sameOwnerClusters}`,
    '',
    '农场分区（owner / 仓库数 / 有周下载数）：',
    ...s.farms.map((f) => `  - ${f.owner}: ${f.n} 仓，其中 ${f.weeklyPositive} 仓有下载`),
    '',
    '全局 basename 撞名 Top10（basename / 仓数 / 不同 owner 数 / 最高分）：',
    ...baseTop.map((c) => `  - ${c.basename}: ${c.n} 仓, owners=${c.owners}, score≤${c.maxScore} — e.g. ${c.examples.join(', ')}`),
    '',
    '同作者近似名 Top8：',
    ...ownTop.map((c) => `  - ${c.owner}/${c.basename}: ${c.n} 仓, score≤${c.maxScore}`),
    '',
    '## VERIFICATION BADGES (issue #20)',
    '',
    '| 徽章 | 含义 | 全库仓数 |',
    '|---|---|---|',
    `| ✅ 已验证 | 有周下载 + 有 star + 非农场 | ${badges.verified ?? 0} |`,
    `| ⚠ 弱信号 | 仅有下载或仅有 star + 非农场 | ${badges.weak ?? 0} |`,
    `| ⚠ 未验证 | 无下载、无 star、非农场 | ${badges.unverified ?? 0} |`,
    `| 🚫 农场 | 单账号仓库数 > ${FARM_OWNER_THRESHOLD} | ${badges.farm ?? 0} |`,
    '',
    '一键过滤：`applyVerificationFilter(rows, ownerCounts, {requireDownloads:true, requireStars:false, excludeFarm:true})`；CLI：`node data/dedup.mjs --filter --downloads --no-farm --limit 20`。',
  ];
  return lines.join('\n') + '\n';
}

function main() {
  const D = JSON.parse(fs.readFileSync(new URL('./eco-data.json', import.meta.url), 'utf8'));
  const args = new Set(process.argv.slice(2));
  if (!args.has('--filter')) { process.stdout.write(renderDedup(D.rows)); return; }
  const owners = countOwners(D.rows);
  const filtered = applyVerificationFilter(D.rows, owners, {
    requireDownloads: args.has('--downloads'),
    requireStars: args.has('--stars'),
    excludeFarm: args.has('--no-farm'),
  });
  const n = Number([...args].find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 20);
  const board = filtered.sort((a, b) => b[ROW.SCORE] - a[ROW.SCORE]).slice(0, n);
  for (const [i, r] of board.entries()) {
    const b = verificationBadge(r, owners);
    console.log(`${i + 1}. ${r[ROW.ID]} | score=${r[ROW.SCORE]} | ${b.label}`);
  }
  console.log(`(filtered ${filtered.length} of ${D.rows.length} rows)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
