(function () {
  'use strict';
  const D = window.__DATA__;
  const M = D.meta;
  const TAGS = M.tags;
  const ROWS = D.rows; // [id, score, stars, weekly, growth, age, seg, act, arch, tags]
  ROWS.forEach((r, i) => { r._rank = i + 1; });

  const $ = (s) => document.querySelector(s);
  const el = (tag, html) => { const e = document.createElement(tag); if (html != null) e.innerHTML = html; return e; };
  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const gTxt = (g) => (g == null ? '<span class="na">—</span>' : '<span class="' + (g >= 0 ? 'pos' : 'neg') + '">' + (g >= 0 ? '+' : '') + Math.round(g) + '%</span>');
  const ageTxt = (a) => (a == null ? '<span class="na">—</span>' : a < 1 ? '&lt;1 天' : a < 365 ? Math.round(a) + ' 天' : (a / 365).toFixed(1) + ' 年');
  const tagName = (i) => TAGS[i] ? TAGS[i].name : '';
  const famName = (i) => TAGS[i] ? TAGS[i].fam : '';

  // ---- KPIs ----
  $('#sub').textContent = '数据快照 ' + M.date + ' · 全语料 ' + fmt(M.counts.repos) + ' 仓 · 每周重算百分位';
  const kpis = [
    [fmt(M.counts.repos), '仓库总数'],
    [fmt(M.counts.starPositive), '有 Star'],
    [fmt(M.counts.weeklyPositive), '有周下载'],
    [fmt(M.counts.growthPositive), '有环比信号'],
    [fmt(M.counts.new30), '近 30 天新建'],
    [fmt(M.counts.tags), '细分标签'],
    [fmt(M.counts.enriched || 0), 'README/npm 补全'],
  ];
  $('#kpis').innerHTML = kpis.map((k) => '<div class="kpi"><b>' + k[0] + '</b><span>' + k[1] + '</span></div>').join('');

  // ---- heatmap ----
  (function () {
    const maxCell = Math.max(1, ...M.heat.flatMap((h) => h.cells));
    let t = '<table><thead><tr><th class="rowh">标签 \\ 周</th>';
    M.weeks.forEach((w, i) => { t += '<th class="wk" title="' + w + '">' + w.slice(5) + '</th>'; });
    t += '</tr></thead><tbody>';
    for (const h of M.heat) {
      t += '<tr><th class="rowh">' + esc(tagName(h.tag)) + ' <span style="color:#a0a4ab;font-weight:400">' + fmt(h.total) + '</span></th>';
      h.cells.forEach((v, i) => {
        const a = v === 0 ? 0 : 0.12 + 0.88 * Math.min(1, v / maxCell);
        const bg = v === 0 ? '#f7f8fa' : 'rgba(43,92,255,' + a.toFixed(2) + ')';
        const col = a > 0.55 ? '#fff' : '#0b1b4a';
        t += '<td class="cell" style="background:' + bg + ';color:' + col + '" title="' + esc(tagName(h.tag)) + ' · ' + M.weeks[i] + ' 当周新建 ' + v + ' 个">' + (v || '') + '</td>';
      });
      t += '</tr>';
    }
    $('#heat').innerHTML = t + '</tbody></table>';
  })();

  // ---- lanes ----
  (function () {
    $('#lanes').innerHTML = M.lanes.map((l) => {
      const t = TAGS[l.tag];
      return '<div class="lane">' +
        '<div class="t"><span>' + esc(t.name) + '</span><span class="fam">' + esc(t.fam) + '</span></div>' +
        '<div class="row"><span>仓库</span><b>' + fmt(l.repos) + '</b></div>' +
        '<div class="row"><span>近 30 天新建</span><b>' + fmt(l.new30) + ' · ' + l.newShare + '%</b></div>' +
        '<div class="row"><span>有下载</span><b>' + fmt(l.npm) + '</b></div>' +
        '<div class="row"><span>周下载合计</span><b>' + fmt(l.weeklySum) + '</b></div>' +
        '<div class="row"><span>环比中位</span><b class="' + (l.growthMed == null ? 'na' : l.growthMed >= 0 ? 'pos' : 'neg') + '">' + (l.growthMed == null ? '—' : (l.growthMed >= 0 ? '+' : '') + l.growthMed + '%') + '</b></div>' +
        '<div class="top">头部：' + esc(l.top) + '</div>' +
        '</div>';
    }).join('');
  })();

  // ---- star velocity (real snapshot diff) ----
  (function () {
    const v = (M.counts && M.counts.velocity) || {};
    $('#velNote').textContent = v.note
      ? v.note + '（需相邻两个快照都覆盖该仓；cron 每周累积）'
      : '差分 ' + (v.prevDate || '—') + ' → ' + M.date + ' · ' + (v.days ? Math.round(v.days) : '—') + ' 天 · 可比较 ' + fmt(v.overlap || 0) + ' 仓 · 单位：星/天';
    const top = M.velocityTop || [];
    $('#velocity').innerHTML = top.length ? top.map((x) =>
      '<div class="lane">' +
        '<div class="t"><span>' + esc(x.repo) + '</span></div>' +
        '<div class="row"><span>当前 Star</span><b>' + fmt(x.stars) + '</b></div>' +
        '<div class="row"><span>本段新增</span><b class="' + (x.delta >= 0 ? 'pos' : 'neg') + '">' + (x.delta >= 0 ? '+' : '') + fmt(x.delta) + '</b></div>' +
        '<div class="row"><span>增速</span><b class="' + (x.vel >= 0 ? 'pos' : 'neg') + '">' + (x.vel >= 0 ? '+' : '') + x.vel + ' /天</b></div>' +
        '<div class="row"><span>区间涨幅</span><b>' + (x.pct == null ? '—' : (x.pct >= 0 ? '+' : '') + x.pct + '%') + '</b></div>' +
      '</div>'
    ).join('') : '<div style="color:#a0a4ab">数据积累中：还没有两个可比较的全量快照。</div>';
  })();

  // ---- parent x capability matrix ----
  function renderPairBanner() {
    const b = $('#pairBanner');
    if (!state.pair) { b.style.display = 'none'; b.innerHTML = ''; return; }
    const p = tagName(state.pair.parent);
    const label = state.pair.generic ? p + ' · 仅通用（无能力标签）' : p + ' × ' + tagName(state.pair.cap);
    b.style.display = 'flex';
    b.innerHTML = '<span>下钻：<b>' + esc(label) + '</b></span><button id="clearPair">清除下钻</button>';
    $('#clearPair').onclick = () => { state.pair = null; state.page = 1; renderPairBanner(); render(); };
  }
  (function () {
    const MX = M.matrix; if (!MX) return;
    const maxN = Math.max(1, ...MX.cells.flat().map((c) => c.n));
    let t = '<table><thead><tr><th class="rowh">大类 \\ 能力</th>';
    MX.caps.forEach((ci) => { t += '<th class="cap">' + esc(tagName(ci)) + '</th>'; });
    t += '<th class="cap gen">仅通用</th></tr></thead><tbody>';
    MX.parents.forEach((pi, ri) => {
      t += '<tr><th class="rowh">' + esc(tagName(pi)) + '<span class="pt">' + fmt(MX.parentTotal[ri]) + '</span></th>';
      MX.caps.forEach((ci, cj) => {
        const c = MX.cells[ri][cj];
        const a = c.n === 0 ? 0 : 0.10 + 0.90 * Math.min(1, c.n / maxN);
        const bg = c.n === 0 ? '#f7f8fa' : 'rgba(43,92,255,' + a.toFixed(2) + ')';
        const col = a > 0.55 ? '#fff' : '#0b1b4a';
        t += '<td class="mcell" style="background:' + bg + ';color:' + col + '" data-p="' + pi + '" data-c="' + ci + '" title="' + esc(tagName(pi)) + ' × ' + esc(tagName(ci)) + '：' + c.n + ' 仓 · 近 30 天新建 ' + c.new30 + '">' + (c.n || '') + '</td>';
      });
      const g = MX.genericOnly[ri];
      t += '<td class="mcell gen" data-p="' + pi + '" data-gen="1" title="' + esc(tagName(pi)) + ' 仅通用（无能力标签）：' + g.n + ' 仓 · 近 30 天新建 ' + g.new30 + '">' + fmt(g.n) + '</td>';
      t += '</tr>';
    });
    $('#matrix').innerHTML = t + '</tbody></table>';
    $('#matrix').querySelectorAll('.mcell').forEach((td) => td.addEventListener('click', () => {
      const p = +td.dataset.p;
      state.pair = td.dataset.gen ? { parent: p, generic: true } : { parent: p, cap: +td.dataset.c };
      state.tag = -1; state.fam = ''; $('#fam').value = ''; state.page = 1;
      renderChips(); renderPairBanner(); render();
      window.scrollTo({ top: $('#rankPanel').offsetTop - 16, behavior: 'smooth' });
    }));
  })();

  // ---- controls ----
  const tagCount = new Array(TAGS.length).fill(0);
  ROWS.forEach((r) => r[9].forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));

  const fams = Array.from(new Set(TAGS.map((t) => t.fam)));
  $('#fam').innerHTML = '<option value="">全部家族</option>' + fams.map((f) => '<option value="' + esc(f) + '">' + esc(f) + '</option>').join('');

  const state = { q: '', fam: '', tag: -1, pair: null, sort: 'score', dir: -1, page: 1, noarch: true, onlyw: false, lowsig: false, pageSize: 50 };
  const sortKeyIdx = { score: 1, stars: 2, weekly: 3, growth: 4, age: 5, act: 7, cov: 11, vel: 13 };
  const GEN_SET = new Set(M.matrix ? M.matrix.generic : []);

  function renderChips() {
    const list = TAGS.map((t, i) => ({ t, i })).filter((x) => !state.fam || x.t.fam === state.fam).sort((a, b) => (tagCount[b.i] || 0) - (tagCount[a.i] || 0));
    $('#chips').innerHTML = list.map((x) =>
      '<button class="chip' + (state.tag === x.i ? ' on' : '') + '" data-tag="' + x.i + '">' + esc(x.t.name) + '<small>' + fmt(tagCount[x.i] || 0) + '</small></button>'
    ).join('');
    $('#chips').querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.tag; state.tag = state.tag === i ? -1 : i; state.pair = null; state.page = 1; renderPairBanner(); renderChips(); render();
    }));
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let out = ROWS.filter((r) => {
      if (state.noarch && r[8]) return false;
      if (state.lowsig) { if (!r[12]) return false; }
      else if (r[11] < 0.4) return false;
      if (state.onlyw && !(r[3] > 0)) return false;
      if (state.fam) { const ok = r[9].some((t) => TAGS[t].fam === state.fam); if (!ok) return false; }
      if (state.tag >= 0 && !(r[9].indexOf(state.tag) >= 0)) return false;
      if (state.pair) {
        if (r[9].indexOf(state.pair.parent) < 0) return false;
        if (state.pair.generic) { if (!r[9].every((t) => GEN_SET.has(t))) return false; }
        else if (r[9].indexOf(state.pair.cap) < 0) return false;
      }
      if (q && r[0].toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    const k = state.sort, dir = state.dir;
    if (k === 'rank' || k === 'repo') {
      out.sort((a, b) => k === 'repo' ? dir * a[0].localeCompare(b[0]) : dir * (a._rank - b._rank));
    } else {
      const idx = sortKeyIdx[k];
      out.sort((a, b) => {
        let va = a[idx], vb = b[idx];
        if (va == null) va = -Infinity; if (vb == null) vb = -Infinity;
        if (va === vb) return a._rank - b._rank;
        return dir * (va - vb);
      });
    }
    return out;
  }

  function render() {
    const all = filtered();
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * state.pageSize;
    const slice = all.slice(start, start + state.pageSize);

    const rowsHtml = slice.map((r) => {
      const tags = r[9].map((ti) => '<span class="tg' + (r[9].length > 2 ? ' alt' : '') + '">' + esc(tagName(ti)) + '</span>').join('');
      return '<tr>' +
        '<td class="num">' + r._rank + '</td>' +
        '<td><span class="repo">' + esc(r[0]) + (r[8] ? '<span class="arch">归档</span>' : '') + (r[10] ? '<span class="enr" title="标签含 README/npm 补全信号">补</span>' : '') + (r[12] ? '<span class="arch" title="覆盖率 < 0.5：只有部分信号">低信号</span>' : '') + '</span></td>' +
        '<td>' + tags + '</td>' +
        '<td class="num"><b>' + r[1].toFixed(1) + '</b></td>' +
        '<td class="num" title="coverage = 已有信号的权重之和（星 0.4 / 下载 0.3 / 增长 0.2 / 活跃 0.1）">' + Math.round(r[11] * 100) + '%</td>' +
        '<td class="num">' + fmt(r[2]) + '</td>' +
        '<td class="num">' + (r[13] == null ? '<span class="na">—</span>' : '<span class="' + (r[13] >= 0 ? 'pos' : 'neg') + '">' + (r[13] >= 0 ? '+' : '') + r[13].toFixed(1) + '</span>') + '</td>' +
        '<td class="num">' + (r[3] > 0 ? fmt(r[3]) : '<span class="na">—</span>') + '</td>' +
        '<td class="num">' + gTxt(r[4]) + '</td>' +
        '<td class="num">' + ageTxt(r[5]) + '</td>' +
        '<td class="num">' + Math.round(r[7]) + '</td>' +
        '</tr>';
    }).join('');
    $('#tbody').innerHTML = rowsHtml || '<tr><td colspan="11" style="padding:24px;text-align:center;color:#a0a4ab">没有匹配的仓库</td></tr>';

    const from = total ? start + 1 : 0, to = Math.min(total, start + state.pageSize);
    $('#pager').innerHTML =
      '<button id="prev"' + (state.page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span>第 <input id="pg" type="number" min="1" max="' + pages + '" value="' + state.page + '"> / ' + pages + ' 页</span>' +
      '<button id="next"' + (state.page >= pages ? ' disabled' : '') + '>下一页</button>' +
      '<span class="count">显示 ' + from + '–' + to + ' / 共 ' + fmt(total) + ' 个（全量 ' + fmt(ROWS.length) + '）</span>';
    $('#prev').onclick = () => { state.page--; render(); window.scrollTo({ top: document.querySelector('.rank').offsetTop - 80, behavior: 'smooth' }); };
    $('#next').onclick = () => { state.page++; render(); window.scrollTo({ top: document.querySelector('.rank').offsetTop - 80, behavior: 'smooth' }); };
    $('#pg').onchange = (e) => { let p = parseInt(e.target.value, 10) || 1; state.page = Math.max(1, Math.min(pages, p)); render(); };
  }

  $('#q').addEventListener('input', (e) => { state.q = e.target.value; state.page = 1; render(); });
  $('#fam').addEventListener('change', (e) => { state.fam = e.target.value; state.tag = -1; state.pair = null; state.page = 1; renderPairBanner(); renderChips(); render(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; state.dir = e.target.value === 'age' ? 1 : -1; state.page = 1; render(); });
  $('#noarch').addEventListener('change', (e) => { state.noarch = e.target.checked; state.page = 1; render(); });
  $('#onlyw').addEventListener('change', (e) => { state.onlyw = e.target.checked; state.page = 1; render(); });
  $('#lowsig').addEventListener('change', (e) => { state.lowsig = e.target.checked; state.page = 1; render(); });
  document.querySelectorAll('table.rank th[data-k]').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.k;
    if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = (k === 'age' || k === 'rank' || k === 'repo') ? 1 : -1; }
    state.page = 1; $('#sort').value = sortKeyIdx[k] ? k : 'score'; render();
  }));

  $('#totalRows').textContent = fmt(ROWS.length);
  $('#formula').textContent = M.formula;
  $('#note').innerHTML =
    '<b>口径说明</b><br>' +
    '① 「综合」= 四项百分位加权 + (1−coverage)×50（中性先验），只在“有该信号的仓库”里算百分位：' + fmt(M.counts.starPositive) + ' 个有 Star、' + fmt(M.counts.weeklyPositive) + ' 个有周下载、' + fmt(M.counts.growthPositive) + ' 个有环比信号。coverage = 星 0.4 + 下载 0.3 + 增长 0.2 + 活跃 0.1 中已有项的权重和；缺项不再是 0 分惩罚，而是补 50 分的“不知道”。旧公式为「缺项记 0」不补：0.40×星标 + 0.30×下载 + 0.20×增长 + 0.10×活跃。新旧 top50 有 <b>' + (M.scoringDiff ? M.scoringDiff.changed : 0) + '/50</b> 条名次或分数变动，完整对照见 <code>scoring-diff.json</code>。' +
    '<br>①a coverage &lt; 0.5 的仓库信号过少，直接标「低信号」且默认不进主榜；勾选「低信号视图」单独查看。主榜要求 coverage ≥ 0.4，因此头部不会出现 0 星仓。' +
    '<br>② 「环比」= (本周 − 上周) / 上周，只对已验证 npm 映射且上周 ≥10 的仓库计算；其余显示 —。' +
    '<br>③ 「细分标签」由 仓库名 + 描述 + 主题词 关键词匹配，每仓最多 4 个，兜底「其他」；多标签会重复计数。' +
    '<br>④ 「增长跑道」统计近 26 周新建仓库按标签的周分布；「标签跑道」按近 30 天新仓数排序。' +
    '<br>⑤ 排名是快照横截面，不是成长性预测；归档仓库默认排除。主榜 ' + fmt(M.counts.mainRows) + ' 仓为 coverage≥0.4 且有信号者，全量 ' + fmt(M.counts.repos) + ' 仓仍可在关闭过滤后查看。' +
    '<br>⑥ 「下钻矩阵」格子＝同时带"大类＋能力"两个标签的仓库数（多标签会重复计数，不含归档，与榜单默认口径一致）；「仅通用」＝带该大类但无任何能力标签的仓库，是待补信号的信息缺口。点格子按双标签交集过滤榜单。' +
    '<br>⑦ 「补」徽标＝该仓标签含 README 正文（清洗后）＋npm keywords 补全的能力信号（共 ' + fmt(M.counts.enriched || 0) + ' 仓，每仓标签上限 6）；补全只增标签、不改综合指数。' +
    '<br>⑧ 「★/天」＝相邻两次快照的 Star 差分 ÷ 天数，只用两次都出现的仓库；不足两个全量快照时显示「数据积累中」并靠每周 cron 累积。热力图的「周新增」仍是新建仓口径，两者不同。' +
    '<br>数据出处：github.com/121212165/dsh-plugin-eco-scan · reports/' + M.date;

  renderChips();
  render();
})();