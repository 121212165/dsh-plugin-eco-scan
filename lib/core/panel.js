export function htmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
export function pct(part, total) {
    return total ? `${Math.round((part / total) * 1000) / 10}%` : '0%';
}
function compact(value) {
    if (!Number.isFinite(value))
        return '—';
    const abs = Math.abs(value);
    const scaled = (factor, suffix) => `${Math.round((value / factor) * 100) / 100}${suffix}`;
    if (abs >= 1_000_000)
        return scaled(1_000_000, 'M');
    if (abs >= 10_000)
        return scaled(1_000, 'k');
    return String(Math.round(value));
}
function fullNumber(value) {
    const [integer = '', decimal] = String(value).split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimal === undefined ? grouped : `${grouped}.${decimal}`;
}
function compactColumn(values) {
    return values.some((value) => value !== null && Number.isFinite(value) && Math.abs(value) >= 10_000);
}
function formatNumber(value, useCompact) {
    return useCompact ? compact(value) : String(value);
}
function numberCell(value, useCompact) {
    if (value === null)
        return '<td class="num" title="未观测">—</td>';
    return `<td class="num" title="${htmlEscape(fullNumber(value))}">${htmlEscape(formatNumber(value, useCompact))}</td>`;
}
function deltaLabel(value, useCompact) {
    if (value === null)
        return '<span class="delta" title="未观测">—</span>';
    if (value === 0)
        return '<span class="delta" title="无变化">—</span>';
    const direction = value > 0 ? 'up' : 'down';
    const arrow = value > 0 ? '▲' : '▼';
    const formatted = `${value > 0 ? '+' : ''}${formatNumber(value, useCompact)}`;
    const full = `${value > 0 ? '+' : ''}${fullNumber(value)}`;
    return `<span class="delta ${direction}" title="${htmlEscape(full)}">${arrow} ${htmlEscape(formatted)}</span>`;
}
/** Nulls remain gaps: dashed connectors mark interruptions without treating
 * missing observations as zero or including them in the vertical scale. */
export function sparkline(values) {
    const observedValues = values.filter((value) => value !== null && Number.isFinite(value));
    if (observedValues.length < 2)
        return '<span class="spark-empty">—</span>';
    const width = 120;
    const height = 24;
    const min = Math.min(...observedValues);
    const max = Math.max(...observedValues);
    const span = max - min || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : width;
    const points = values.map((value, index) => {
        if (value === null || !Number.isFinite(value))
            return null;
        return {
            index,
            value,
            x: Math.round(index * stepX * 10) / 10,
            y: Math.round((height - 3 - ((value - min) / span) * (height - 6)) * 10) / 10,
        };
    });
    const observed = points.filter((point) => point !== null);
    const runs = [];
    let current = [];
    const flush = () => {
        if (current.length)
            runs.push(current);
        current = [];
    };
    for (const point of points) {
        if (!point)
            flush();
        else
            current.push(point);
    }
    flush();
    const gaps = observed
        .slice(1)
        .map((point, index) => {
        const previous = observed[index];
        if (point.index - previous.index === 1)
            return '';
        return `<line class="spark-gap" x1="${previous.x}" y1="${previous.y}" x2="${point.x}" y2="${point.y}"><title>中断</title></line>`;
    })
        .join('');
    const last = observed[observed.length - 1];
    const shapes = runs
        .map((run) => {
        if (run.length > 1)
            return `<polyline class="spark-line" points="${run.map((point) => `${point.x},${point.y}`).join(' ')}"/>`;
        const point = run[0];
        return point === last ? '' : `<circle class="spark-dot" cx="${point.x}" cy="${point.y}" r="1.6"/>`;
    })
        .join('');
    const title = htmlEscape(values.map((value) => (value === null ? '—' : compact(value))).join(' → '));
    const latest = htmlEscape(compact(last.value));
    return `<span class="spark-wrap"><svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}"><title>${title}</title>${gaps}${shapes}<circle class="spark-last" cx="${last.x}" cy="${last.y}" r="2"/></svg><span class="spark-value" title="${htmlEscape(fullNumber(last.value))}">${latest}</span></span>`;
}
function seriesValues(points, dates) {
    if (!points?.length)
        return { values: dates.map(() => null), field: 'npm' };
    const byDate = new Map(points.map((point) => [point.date, point]));
    const weekly = dates.map((date) => byDate.get(date)?.weekly ?? null);
    const field = weekly.some((value) => value !== null) ? 'npm' : 'stars';
    return { values: field === 'npm' ? weekly : dates.map((date) => byDate.get(date)?.stars ?? null), field };
}
function heatCells(heatmap) {
    const max = Math.max(1, ...[...heatmap.values.values()].flat().filter((value) => value !== null));
    const useCompact = heatmap.dates.map((_, index) => compactColumn(heatmap.segments.map((segment) => heatmap.values.get(segment)?.[index] ?? null)));
    const rows = heatmap.segments
        .map((segment) => {
        const values = heatmap.values.get(segment) ?? [];
        const cells = values
            .map((value, index) => {
            if (value === null)
                return '<td class="heat-cell empty" title="未观测">·</td>';
            const level = Math.min(4, Math.floor((value / max) * 5));
            return `<td class="heat-cell level-${level}" title="${htmlEscape(segment)} · ${htmlEscape(fullNumber(value))} 周下载">${htmlEscape(formatNumber(value, useCompact[index] ?? false))}</td>`;
        })
            .join('');
        return `<tr><th scope="row">${htmlEscape(segment)}</th>${cells}</tr>`;
    })
        .join('\n');
    const head = heatmap.dates.map((date) => `<th class="num" scope="col">${htmlEscape(date.slice(5))}</th>`).join('');
    return `<div class="table-wrap heat-wrap"><table class="heat"><caption class="sr-only">赛道 × 日期周下载热力图</caption><thead><tr><th scope="col">赛道</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
export function renderPanel(data) {
    const segmentCompact = {
        repos: compactColumn(data.segments.map((row) => row.repos)),
        stars: compactColumn(data.segments.map((row) => row.stars)),
        weekly: compactColumn(data.segments.map((row) => row.weeklyDownloads)),
        median: compactColumn(data.segments.map((row) => row.medianStars)),
    };
    const segmentRows = data.segments
        .map((row) => `<tr><th scope="row">${htmlEscape(row.segment)}</th>${numberCell(row.repos, segmentCompact.repos)}${numberCell(row.stars, segmentCompact.stars)}${numberCell(row.weeklyDownloads, segmentCompact.weekly)}${numberCell(row.medianStars, segmentCompact.median)}</tr>`)
        .join('\n');
    const diffByRepo = new Map(data.diff.map((row) => [row.repoId, row]));
    const compactDeltas = compactColumn(data.scores.map((row) => diffByRepo.get(row.repoId)?.npmDelta ?? null));
    const topRows = data.scores
        .map((row, index) => {
        const series = seriesValues(data.series.get(row.repoId), data.heatmap.dates);
        const label = series.field === 'npm' ? '周下载趋势' : '★ 趋势';
        return `<li class="rank-item"><span class="rank-number">${String(index + 1).padStart(2, '0')}</span><div class="rank-content"><div class="rank-line"><div class="identity"><strong class="repo">${htmlEscape(row.repoId)}</strong><span class="segment-label">${htmlEscape(row.segment)}</span></div><div class="score"><strong>${htmlEscape(row.score)}</strong><span>综合分</span></div></div><div class="rank-line rank-secondary"><div class="change">${deltaLabel(diffByRepo.get(row.repoId)?.npmDelta ?? null, compactDeltas)}<span>周下载变化</span></div><div class="trend" title="${label}">${sparkline(series.values)}</div></div></div></li>`;
    })
        .join('\n');
    const stat = (value) => `<b title="${htmlEscape(fullNumber(value))}">${htmlEscape(compact(value))}</b>`;
    const displayDate = data.date ? data.date.slice(5).replace('-', '.') : '—';
    const displayYear = data.date?.slice(0, 4) ?? '';
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh 插件生态面板 ${htmlEscape(data.date ?? '')}</title>
<style>
:root{color-scheme:light dark;--bg:#f3f5f8;--surface:#fff;--fg:#14213a;--muted:#657086;--border:#dfe4eb;--accent:#2859dc;--hero:#101d33;--hero-fg:#f7f9ff;--hero-muted:#b4c0d4;--hero-accent:#91b4ff;--up:#16734a;--down:#b42318;--heat-1:#eff6ff;--heat-2:#dbeafe;--heat-3:#93c5fd;--heat-4:#1d4ed8;--heat-5:#1e3a8a;--heat-low-fg:#172554;--heat-high-fg:#fff;--s1:4px;--s2:8px;--s3:16px;--s4:32px;--r:6px;--r-lg:20px}
@media (prefers-color-scheme:dark){:root{--bg:#0d1118;--surface:#141a23;--fg:#ecf0f7;--muted:#9aa7ba;--border:#293241;--accent:#8babff;--hero:#151f31;--hero-fg:#f7f9ff;--hero-muted:#a8b5cc;--hero-accent:#a9c2ff;--up:#6fd5a5;--down:#ff9b91;--heat-1:#172554;--heat-2:#1e3a8a;--heat-3:#1e40af;--heat-4:#1d4ed8;--heat-5:#2563eb;--heat-low-fg:#fff;--heat-high-fg:#fff}}
*{box-sizing:border-box}body{margin:0;padding:48px 24px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}main{max-width:1160px;margin:0 auto}h1,h2,p{margin-top:0}.hero{overflow:hidden;padding:40px;border-radius:var(--r-lg);background:radial-gradient(circle at 86% 4%,#28477a 0,transparent 38%),var(--hero);color:var(--hero-fg)}.hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--s4)}.eyebrow,.section-index{font-size:11px;font-weight:650;letter-spacing:.16em;text-transform:uppercase}.eyebrow{margin-bottom:20px;color:var(--hero-muted)}h1{margin-bottom:0;font-size:48px;line-height:1.08;letter-spacing:-.045em;font-weight:700}h1 span{color:var(--hero-accent)}.date-stamp{text-align:right;flex:none}.date-stamp b{display:block;font-size:64px;line-height:1;letter-spacing:-.065em;font-weight:300;font-variant-numeric:tabular-nums}.date-stamp span{display:block;margin-top:10px;color:var(--hero-muted);font-size:12px}.hero-bottom{display:grid;grid-template-columns:1fr 2fr;gap:40px;align-items:end;margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,.17)}.hero-copy{max-width:280px;margin-bottom:0;color:var(--hero-muted);font-size:13px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--s3);margin:0}.stat{padding-left:16px;border-left:1px solid rgba(255,255,255,.17)}.stat b{display:block;font-size:23px;line-height:1.2;font-variant-numeric:tabular-nums}.stat span{display:block;margin-top:5px;color:var(--hero-muted);font-size:11px}.generated{margin:20px 0 0;color:var(--hero-muted);font-size:11px;text-align:right}section{margin-top:56px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:var(--s4);margin-bottom:20px}.section-index{margin-bottom:8px;color:var(--accent)}h2{margin-bottom:0;font-size:28px;line-height:1.2;letter-spacing:-.025em}.section-sub{margin:8px 0 0;color:var(--muted);font-size:13px}.heat-legend{display:flex;align-items:center;gap:var(--s1);color:var(--muted);font-size:11px;white-space:nowrap}.legend-swatch{display:inline-block;width:22px;height:12px;border-radius:2px}.legend-note{margin-left:var(--s2)}.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.heat-wrap{padding:12px 16px}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle}thead th{color:var(--muted);font-size:11px;font-weight:600}tbody tr:last-child>*{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums}.heat{min-width:max-content;table-layout:fixed;border-collapse:separate;border-spacing:3px}.heat th,.heat td{border:0}.heat th[scope=row]{width:170px;color:var(--fg);font-size:12px;font-weight:500}.heat-cell{text-align:right;font-variant-numeric:tabular-nums;font-size:12px;min-width:56px;border-radius:3px}.heat-cell.empty{color:var(--muted);text-align:center;background:transparent}.level-0{background:var(--heat-1);color:var(--heat-low-fg)}.level-1{background:var(--heat-2);color:var(--heat-low-fg)}.level-2{background:var(--heat-3);color:var(--heat-low-fg)}.level-3{background:var(--heat-4);color:var(--heat-high-fg)}.level-4{background:var(--heat-5);color:var(--heat-high-fg)}.note{margin:12px 0 0;color:var(--muted);font-size:12px}.ranking-section{display:grid;grid-template-columns:260px 1fr;gap:64px;padding-top:32px;border-top:1px solid var(--border)}.ranking-intro p:last-child{max-width:210px}.ranking{margin:0;padding:0;list-style:none}.rank-item{display:grid;grid-template-columns:44px 1fr;gap:var(--s3);padding:20px 0;border-bottom:1px solid var(--border)}.rank-item:first-child{padding-top:0}.rank-item:last-child{border-bottom:0}.rank-number{padding-top:2px;color:var(--muted);font:16px/1.5 ui-monospace,"Cascadia Mono",monospace;font-variant-numeric:tabular-nums}.rank-line{display:flex;justify-content:space-between;align-items:center;gap:var(--s3)}.identity{display:flex;align-items:baseline;gap:12px;min-width:0}.repo{font-size:16px}.repo,.spark-value,.rank-number{font-family:ui-monospace,"Cascadia Mono",monospace}.segment-label{color:var(--muted);font-size:12px}.score{display:flex;align-items:baseline;gap:7px;flex:none}.score strong{font-size:20px;font-variant-numeric:tabular-nums}.score span,.change>span:last-child{color:var(--muted);font-size:11px}.rank-secondary{margin-top:10px}.change{display:flex;align-items:baseline;gap:8px}.delta{font-weight:650;font-variant-numeric:tabular-nums}.delta.up{color:var(--up)}.delta.down{color:var(--down)}.trend{color:var(--muted)}.spark-wrap{display:flex;align-items:center;gap:var(--s2)}.spark{display:block;flex:none;fill:none;stroke:var(--accent);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}.spark-line{fill:none}.spark-gap{stroke:var(--muted);stroke-dasharray:3 3}.spark-dot,.spark-last{fill:var(--accent);stroke:none}.spark-empty{color:var(--muted)}.spark-value{min-width:38px;font-size:12px;font-variant-numeric:tabular-nums}.appendix{margin-top:40px;border-top:1px solid var(--border)}details{border-bottom:1px solid var(--border)}summary{display:flex;justify-content:space-between;align-items:center;gap:var(--s3);padding:22px 0;cursor:pointer;list-style:none;font-size:16px;font-weight:650}summary::-webkit-details-marker{display:none}summary:before{content:"+";order:3;color:var(--muted);font:20px/1 ui-monospace,monospace}details[open] summary:before{content:"−"}.summary-count{margin-left:auto;color:var(--muted);font-size:12px;font-weight:400}.segments{min-width:620px;margin-bottom:24px}.segments tbody th{color:var(--fg);font-size:12px;font-weight:500}.segments tbody tr:nth-child(even){background:color-mix(in srgb,var(--accent) 3%,transparent)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:760px){body{padding:24px 12px}.hero{padding:24px;border-radius:16px}.hero-top{gap:16px}h1{font-size:38px}.date-stamp b{font-size:42px}.hero-bottom{display:block;margin-top:32px}.hero-copy{max-width:none}.stats{grid-template-columns:repeat(2,1fr);margin-top:24px;gap:20px 12px}.generated{text-align:left}section{margin-top:40px}.section-head{display:block}.heat-legend{margin-top:16px}.heat-wrap{padding:8px}.heat th[scope=row]{width:120px}.ranking-section{display:block;padding-top:24px}.ranking-intro p:last-child{max-width:none}.ranking{margin-top:24px}.rank-item{grid-template-columns:32px 1fr;gap:8px}.identity{display:block}.segment-label{display:block;margin-top:2px}.rank-secondary{align-items:end}.change{display:block}.change>span:last-child{display:block;margin-top:2px}.spark{width:100px}.spark-value{min-width:34px}.score span{display:none}}@media print{body{padding:0;background:#fff;color:#000;font-size:11px}main{max-width:none}.hero{padding:24px;background:#fff;color:#000;border:1px solid #bbb;border-radius:0}.hero h1 span,.eyebrow,.date-stamp span,.hero-copy,.stat span,.generated{color:#333}.hero-bottom,.stat{border-color:#bbb}section{margin-top:24px}.table-wrap{overflow:visible}table{min-width:0!important;font-size:9px;break-inside:avoid}thead{display:table-header-group}tr,.rank-item{break-inside:avoid}.ranking-section{display:block}.ranking-intro{margin-bottom:16px}.ranking-intro p:last-child{max-width:none}.spark{width:90px}.segments{margin-top:16px}}
</style></head>
<body><main>
<header class="hero"><div class="hero-top"><div><p class="eyebrow">DSH / Ecosystem Intelligence</p><h1>插件生态<br><span>情报简报</span></h1></div><div class="date-stamp"><b>${htmlEscape(displayDate)}</b><span>${htmlEscape(displayYear)} · ${data.heatmap.dates.length} 次快照</span></div></div><div class="hero-bottom"><p class="hero-copy">从星标、下载与发布记录中，观察插件生态的真实动向。</p><div class="stats" aria-label="数据覆盖摘要"><div class="stat">${stat(data.stats.repos)}<span>仓库</span></div><div class="stat"><b>${pct(data.stats.mapped, data.stats.repos)}</b><span>npm 映射覆盖</span></div><div class="stat">${stat(data.stats.withWeekly)}<span>有周下载数据</span></div><div class="stat">${stat(data.stats.withReleases)}<span>有 release 数据</span></div></div></div><p class="generated">生成于 ${htmlEscape(data.generatedAt)}</p></header>
<section aria-labelledby="heat-title"><div class="section-head"><div><p class="section-index">01 / Market Pulse</p><h2 id="heat-title">赛道脉搏</h2><p class="section-sub">近 ${data.heatmap.dates.length} 次快照 · 周下载</p></div>${data.heatmap.dates.length ? '<div class="heat-legend" aria-label="热力图色阶，从低到高"><span>低</span><span class="legend-swatch level-0" aria-hidden="true"></span><span class="legend-swatch level-1" aria-hidden="true"></span><span class="legend-swatch level-2" aria-hidden="true"></span><span class="legend-swatch level-3" aria-hidden="true"></span><span class="legend-swatch level-4" aria-hidden="true"></span><span>高</span><span class="legend-note">· 未观测</span></div>' : ''}</div>${data.heatmap.dates.length ? heatCells(data.heatmap) : '<p class="note">还没有快照。</p>'}<p class="note">颜色越深，周下载越高；「·」是未观测，不是 0。多标签仓库在每个赛道各计一次。</p></section>
<section class="ranking-section" aria-labelledby="top-title"><div class="ranking-intro"><p class="section-index">02 / Top Signals</p><h2 id="top-title">值得关注</h2><p class="section-sub">综合评分排名，以及最近一次周下载变化。</p></div><div><ol class="ranking">${topRows}</ol><p class="note">趋势优先使用 npm 周下载，全部缺失时使用 ★ 星标；虚线表示中断，缺失值不按 0 处理。</p></div></section>
<section class="appendix" aria-label="赛道明细附录"><details><summary><span>赛道明细</span><span class="summary-count">${data.segments.length} 个赛道</span></summary><div class="table-wrap"><table class="segments"><caption class="sr-only">赛道仓库、星标与周下载概览</caption><thead><tr><th scope="col">赛道</th><th class="num" scope="col">仓库</th><th class="num" scope="col">★</th><th class="num" scope="col">周下载</th><th class="num" scope="col">中位 ★</th></tr></thead><tbody>${segmentRows}</tbody></table></div></details></section>
</main></body></html>`;
}
//# sourceMappingURL=panel.js.map