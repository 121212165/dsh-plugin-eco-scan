// WeChat article from the CURRENT build (full-ranking.json) plus the
// recomputed potential board (potential-v4.json). Run after build_dashboard:
//   node --experimental-sqlite build_wechat.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ECO_DATA_DIR || join(process.env.USERPROFILE || process.env.HOME, '.dsh', 'eco-scan');
const rank = JSON.parse(readFileSync(join(here, 'full-ranking.json'), 'utf8'));
const pot = JSON.parse(readFileSync(join(here, 'potential-v4.json'), 'utf8'));
const DATE = rank.date;
const COUNTS = rank.counts;
const db = new DatabaseSync(join(DATA_DIR, 'eco.db'), { readOnly: true });
const descOf = new Map(db.prepare('SELECT id, description FROM repos').all().map((r) => [r.id, r.description || '']));

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clip = (s, n = 110) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

const INK = '#1f2329', SUB = '#646a73', LINE = '#e7e9ed', BRAND = '#2b5cff', BRAND_BG = '#eef2ff', GOLD = '#b8860b', CARD = '#f7f8fa';
const sec = (st, inner) => `<section style="${st}">${inner}</section>`;
const p = (st, inner) => `<p style="${st}">${inner}</p>`;
const span = (st, inner) => `<span style="${st}">${inner}</span>`;
const chip = (bg, color, txt) => span(`display:inline-block;background:${bg};color:${color};border-radius:4px;padding:1px 7px;margin:0 6px 4px 0;font-size:12px;`, txt);

const segName = {
  'framework-runtime': '框架/运行时', 'ui-client': 'UI/客户端', 'tools-devx': '工具/开发体验', 'other': '其他',
  'search-knowledge': '搜索/知识', 'memory-context': '记忆/上下文', 'archive-export': '归档/导出',
  'cost-budget': '成本/预算', 'telemetry-analytics': '遥测/分析',
};
const medal = ['#f5a623', '#9aa0a6', '#cd7f32'];

function boardHead(no, title, note) {
  return sec(`margin:30px 0 16px;padding:0 0 10px;border-bottom:2px solid ${BRAND};`,
    span(`display:inline-block;font-size:12px;font-weight:700;color:#fff;background:${BRAND};border-radius:4px;padding:2px 8px;margin-right:8px;vertical-align:middle;`, no) +
    span(`font-size:18px;font-weight:700;color:${INK};vertical-align:middle;`, title) +
    p(`margin:8px 0 0;font-size:12px;color:${SUB};`, note)
  );
}

function card(i, name, score, chips, desc, scoreColor) {
  const bg = i < 3 ? medal[i] : CARD;
  const fg = i < 3 ? '#fff' : SUB;
  const bd = i < 3 ? 'none' : `1px solid ${LINE}`;
  return sec(`margin:0 0 12px;padding:14px;background:#fff;border:1px solid ${LINE};border-radius:10px;`,
    p(`margin:0 0 8px;`,
      span(`display:inline-block;min-width:24px;height:24px;line-height:24px;text-align:center;font-size:13px;font-weight:800;color:${fg};background:${bg};border:${bd};border-radius:6px;margin-right:8px;vertical-align:middle;`, i + 1) +
      span(`font-size:14px;font-weight:700;color:${INK};word-break:break-all;vertical-align:middle;`, esc(name)) +
      span(`float:right;font-size:18px;font-weight:800;color:${scoreColor};vertical-align:middle;`, score)
    ) +
    p(`margin:0 0 6px;`, chips) +
    (desc ? p(`margin:0;font-size:13px;color:${SUB};line-height:1.75;`, esc(desc)) : '')
  );
}

const N = 20;

const potCards = pot.ranked.slice(0, N).map((r, i) => {
  const g = r.rawGrowthPct != null ? `+${Math.round(r.rawGrowthPct * 100)}%` : '—';
  return card(i, r.repoId, r.potential.toFixed(1),
    chip(BRAND_BG, BRAND, `★ ${fmt(r.stars)}`) + chip(CARD, INK, `周下载 ${fmt(r.weekly)}`) +
    chip(CARD, INK, `环比 ${g}`) + chip(CARD, INK, `${Math.round(r.ageDays)} 天`),
    clip(r.description || descOf.get(r.repoId)), i < 3 ? GOLD : BRAND);
}).join('');

const rankRows = rank.rows.filter((r) => !r.archived).slice(0, N);
const rankCards = rankRows.map((r, i) => {
  const vel = r.starVel != null ? chip(CARD, INK, `★速 +${r.starVel.toFixed(1)}/天`) : '';
  return card(i, r.repo, Number(r.score).toFixed(1),
    chip(BRAND_BG, BRAND, `★ ${fmt(r.stars)}`) + chip(CARD, INK, `周下载 ${fmt(r.weekly)}`) +
    vel + chip(CARD, INK, esc(segName[r.segment] || r.segment)),
    clip(descOf.get(r.repo)), i < 3 ? GOLD : BRAND);
}).join('');

const article = `
<section id="wx-article" style="margin:0 auto;padding:24px 18px 40px;max-width:677px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif;color:${INK};">
  <section id="wx-head" style="margin:0 0 4px;">
    ${p(`margin:0 0 6px;font-size:22px;font-weight:800;line-height:1.4;color:${INK};`, 'DeepSeek Harness 插件生态 · 双榜')}
    ${p(`margin:0 0 4px;font-size:12px;color:${SUB};`, `数据快照 ${DATE} · 全语料 ${fmt(COUNTS.repos)} 仓 · 主榜 ${fmt(COUNTS.mainRows)} 仓`)}
  </section>
  <section id="wx-potential">
    ${boardHead('01', '潜力榜 Top ' + N, `新兴项目动量排序 · 候选 ${fmt(pot.counts.eligible)} → 可评分 ${fmt(pot.counts.ranked)} · 动量/星速/下载/近期增量/新鲜度加权`)}
    ${potCards}
  </section>
  <section id="wx-ranking">
    ${boardHead('02', '综合排名榜 Top ' + N, '星标 40% + 周下载 30% + 环比 20% + 活跃 10% 百分位加权，缺项按覆盖率以中性先验填补；主榜要求覆盖率 ≥0.4')}
    ${rankCards}
  </section>
  <section id="wx-foot">
    ${p(`margin:24px 0 0;font-size:12px;color:${SUB};text-align:center;`, `· 数据出处 github.com/121212165/dsh-plugin-eco-scan · 快照 ${DATE} ·`)}
  </section>
</section>`;

const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>公众号发文 · DSH 插件双榜 ${DATE}</title>
<style>
  body{margin:0;background:#eceef1;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;}
  .bar{position:sticky;top:0;z-index:10;background:#1f2329;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,.15);}
  .bar h1{font-size:14px;margin:0;font-weight:600;flex:1;min-width:160px;}
  button{border:0;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer;background:#2b5cff;color:#fff;}
  button.sec{background:#3a3f47;color:#dfe1e5;font-weight:600;}
  #status{font-size:13px;font-weight:600;} .ok{color:#52c41a;} .err{color:#ff7875;}
  .stage{padding:20px 12px 60px;}
  .paper{max-width:720px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden;}
</style>
</head>
<body>
  <div class="bar">
    <h1>公众号发文 · 双榜 ${DATE}</h1>
    <button id="copy">一键复制到公众号</button>
    <button id="copyPlain" class="sec">复制纯文本</button>
    <span id="status"></span>
  </div>
  <div class="stage"><div class="paper">${article}</div></div>
<script>
  const a = document.getElementById('wx-article');
  const st = document.getElementById('status');
  const set = (m, ok) => { st.textContent = m; st.className = ok ? 'ok' : 'err'; };
  async function rich(){
    try{
      if(navigator.clipboard && window.ClipboardItem){
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([a.outerHTML], {type:'text/html'}),
          'text/plain': new Blob([a.innerText], {type:'text/plain'})
        })]);
        set('✓ 已复制，去公众号粘贴', true); return;
      }
      throw 0;
    }catch(e){
      const r = document.createRange(); r.selectNodeContents(a);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      const ok = document.execCommand('copy'); s.removeAllRanges();
      set(ok ? '✓ 已复制（兼容模式）' : '复制失败，请手动全选', ok);
    }
  }
  async function plain(){
    try{ await navigator.clipboard.writeText(a.innerText); set('✓ 已复制纯文本', true); }
    catch(e){
      const t = document.createElement('textarea'); t.value = a.innerText;
      document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy'); t.remove(); set(ok ? '✓ 已复制纯文本' : '复制失败', ok);
    }
  }
  document.getElementById('copy').onclick = rich;
  document.getElementById('copyPlain').onclick = plain;
</script>
</body>
</html>`;

const repoRoot = process.env.ECO_REPO_DIR || 'C:/Users/lenovo/.zcode/workspace/default/dsh-plugin-eco-scan';
const repoOut = join(repoRoot, 'reports', DATE, 'wechat.html');
writeFileSync(repoOut, page, 'utf8');
writeFileSync(join(here, 'wechat.html'), page, 'utf8');
writeFileSync(join(here, 'wechat-article.html'), article.trim(), 'utf8');
console.log('written', repoOut, 'bytes', Buffer.byteLength(page), 'date', DATE, 'rankTop1', rankRows[0]?.repo, 'potTop1', pot.ranked[0]?.repoId);
