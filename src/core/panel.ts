/** Self-contained HTML panel: one file, inline CSS, inline SVG. It carries the
 * same numbers as the JSON report plus two shapes a table cannot show — a
 * 12-snapshot sparkline per ranked repo and a segment × date heatmap. No
 * scripts and no external assets, so it can be opened from disk or served by
 * any static file server without a build step. */
import type { RepoPoint, SegmentHeatmap } from './history.ts';
import type { OverviewRow, TopRow } from './types.ts';

export interface PanelData {
  date: string | null;
  generatedAt: string;
  scores: TopRow[];
  segments: OverviewRow[];
  stats: { repos: number; mapped: number; withWeekly: number; withReleases: number };
  series: Map<string, RepoPoint[]>;
  heatmap: SegmentHeatmap;
}

export function htmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function pct(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 1000) / 10}%` : '0%';
}

function compact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const scaled = (factor: number, suffix: string): string => `${Math.round((value / factor) * 10) / 10}${suffix}`;
  if (abs >= 1_000_000) return scaled(1_000_000, 'M');
  if (abs >= 10_000) return scaled(1_000, 'k');
  return String(Math.round(value));
}

/** One polyline per unbroken run of observations; a null is a gap, not a zero.
 * Fewer than two observations renders an em dash instead of a fake line. */
export function sparkline(values: readonly (number | null)[], width = 120, height = 24): string {
  const observed = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (observed.length < 2) return '<span class="spark-empty">—</span>';
  const min = Math.min(...observed);
  const max = Math.max(...observed);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const runs: string[][] = [];
  let current: string[] = [];
  const flush = (): void => {
    if (current.length) runs.push(current);
    current = [];
  };
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      flush();
      return;
    }
    const x = Math.round(index * stepX * 10) / 10;
    const y = Math.round((height - 3 - ((value - min) / span) * (height - 6)) * 10) / 10;
    current.push(`${x},${y}`);
  });
  flush();
  const shapes = runs
    .map((run) =>
      run.length > 1
        ? `<polyline points="${run.join(' ')}"/>`
        : `<circle cx="${(run[0] ?? '0,0').split(',')[0]}" cy="${(run[0] ?? '0,0').split(',')[1]}" r="1.6"/>`,
    )
    .join('');
  const title = htmlEscape(values.map((value) => (value === null ? '—' : compact(value))).join(' → '));
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"><title>${title}</title>${shapes}</svg>`;
}

function seriesValues(points: readonly RepoPoint[] | undefined, dates: readonly string[]): { values: (number | null)[]; field: 'npm' | 'stars' } {
  if (!points?.length) return { values: dates.map(() => null), field: 'npm' };
  const byDate = new Map(points.map((point) => [point.date, point]));
  const weekly = dates.map((date) => byDate.get(date)?.weekly ?? null);
  const field = weekly.some((value) => value !== null) ? 'npm' : 'stars';
  return { values: field === 'npm' ? weekly : dates.map((date) => byDate.get(date)?.stars ?? null), field };
}

function heatCells(heatmap: SegmentHeatmap): string {
  const max = Math.max(1, ...[...heatmap.values.values()].flat().filter((value): value is number => value !== null));
  const rows = heatmap.segments
    .map((segment) => {
      const values = heatmap.values.get(segment) ?? [];
      const cells = values
        .map((value) => {
          if (value === null) return '<td class="heat-cell empty" title="未观测">·</td>';
          const alpha = Math.max(0.06, Math.round((value / max) * 90) / 100);
          return `<td class="heat-cell" style="background:rgba(var(--accent-rgb),${alpha})" title="${htmlEscape(segment)} · ${htmlEscape(value)} 周下载">${compact(value)}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${htmlEscape(segment)}</th>${cells}</tr>`;
    })
    .join('\n');
  const head = heatmap.dates.map((date) => `<th class="num" scope="col">${htmlEscape(date.slice(5))}</th>`).join('');
  return `<table class="heat"><thead><tr><th scope="col"></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderPanel(data: PanelData): string {
  const segmentRows = data.segments
    .map(
      (row) =>
        `<tr><td>${htmlEscape(row.segment)}</td><td class="num">${row.repos}</td><td class="num">${row.stars}</td><td class="num">${row.weeklyDownloads}</td><td class="num">${row.medianStars}</td></tr>`,
    )
    .join('\n');
  const maxScore = Math.max(1, ...data.scores.map((row) => row.score));
  const topRows = data.scores
    .map((row, index) => {
      const width = Math.round((row.score / maxScore) * 100);
      const series = seriesValues(data.series.get(row.repoId), data.heatmap.dates);
      const label = series.field === 'npm' ? '周下载趋势' : '★ 趋势';
      return `<tr><td class="num">${index + 1}</td><td><strong>${htmlEscape(row.repoId)}</strong><div class="bar"><span style="width:${width}%"></span></div></td><td>${htmlEscape(row.segment)}</td><td class="num">${row.score}</td><td class="num">${row.npmWeekly ?? '—'}</td><td class="num">${row.stars}</td><td class="trend" title="${label}">${sparkline(series.values)}</td></tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh 插件生态面板 ${htmlEscape(data.date ?? '')}</title>
<style>
:root{color-scheme:light dark;--fg:#16181d;--muted:#6b7280;--bg:#ffffff;--line:#e5e7eb;--accent:#2f6feb;--accent-rgb:47,111,235;--soft:#eef3ff}
@media (prefers-color-scheme:dark){:root{--fg:#e6e8ee;--muted:#9aa3b2;--bg:#12141a;--line:#262a34;--accent:#7aa2ff;--accent-rgb:122,162,255;--soft:#1b2233}}
*{box-sizing:border-box}body{margin:0;padding:40px 24px;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:1000px;margin:0 auto}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 12px}p.meta,p.note{color:var(--muted);margin:0 0 28px}p.note{font-size:12px;margin:8px 0 0}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 8px}.stat{border:1px solid var(--line);border-radius:12px;padding:12px 16px;min-width:150px;background:var(--soft)}
.stat b{display:block;font-size:22px}.stat span{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}th{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums}
.bar{height:4px;border-radius:2px;background:var(--line);margin-top:5px;overflow:hidden}.bar span{display:block;height:100%;background:var(--accent)}
.heat{table-layout:fixed}.heat th[scope=row]{width:150px;font-size:12px;text-transform:none;letter-spacing:0;color:var(--fg);font-weight:500}
.heat-cell{text-align:right;font-variant-numeric:tabular-nums;font-size:12px;border-left:2px solid var(--bg)}
.heat-cell.empty{color:var(--muted);text-align:center;background:transparent}
.spark{display:block;fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}.spark circle{fill:var(--accent);stroke:none}
.spark-empty{color:var(--muted)}.trend{width:136px}
</style></head>
<body><main>
<h1>dsh 插件生态面板</h1>
<p class="meta">快照 ${htmlEscape(data.date ?? '—')} · 生成于 ${htmlEscape(data.generatedAt)}</p>
<div class="stats">
<div class="stat"><b>${data.stats.repos}</b><span>仓库</span></div>
<div class="stat"><b>${pct(data.stats.mapped, data.stats.repos)}</b><span>npm 映射覆盖</span></div>
<div class="stat"><b>${data.stats.withWeekly}</b><span>有周下载数据</span></div>
<div class="stat"><b>${data.stats.withReleases}</b><span>有 release 数据</span></div>
</div>
<h2>赛道热度（近 ${data.heatmap.dates.length} 次快照 · 周下载）</h2>
${data.heatmap.dates.length ? heatCells(data.heatmap) : '<p class="note">还没有快照。</p>'}
<p class="note">颜色越深表示该赛道当次快照的周下载越高；「·」表示当天没有观测，不是 0。多标签仓库在每个赛道各计一次。</p>
<h2>赛道</h2>
<table><thead><tr><th>赛道</th><th class="num">仓库</th><th class="num">★</th><th class="num">周下载</th><th class="num">中位 ★</th></tr></thead><tbody>${segmentRows}</tbody></table>
<h2>综合评分 Top</h2>
<table><thead><tr><th class="num">#</th><th>仓库</th><th>赛道</th><th class="num">分</th><th class="num">周下载</th><th class="num">★</th><th>趋势</th></tr></thead><tbody>${topRows}</tbody></table>
<p class="note">趋势列优先画 npm 周下载，全部缺失时退化为 ★ 星标；只连有观测的点。</p>
</main></body></html>`;
}
