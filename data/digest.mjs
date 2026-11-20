import fs from 'node:fs';
const D = JSON.parse(fs.readFileSync(new URL('./eco-data.json', import.meta.url), 'utf8'));
const M = D.meta, ROWS = D.rows;
// row: [id, score, stars, weekly, growth, age, seg, act, arch, tags, isMain, isEnriched, ?, ?]
const TAGS = M.tags;
const famOf = i => TAGS[i]?.fam ?? '?';
const nameOf = i => TAGS[i]?.name ?? '?';

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a,b)=>a-b);
  return s[Math.min(s.length-1, Math.floor(p*(s.length-1)))];
}
function stats(list) {
  const stars = list.map(r=>r[2]).filter(x=>x!=null);
  const weekly = list.map(r=>r[3]).filter(x=>x>0);
  const growth = list.map(r=>r[4]).filter(x=>x!=null && Number.isFinite(x));
  const ages = list.map(r=>r[5]).filter(x=>x!=null);
  return {
    n: list.length,
    starsMedian: pct(stars,0.5), starsP90: pct(stars,0.9),
    weeklyMedian: pct(weekly,0.5), weeklyP90: pct(weekly,0.9),
    weeklySum: weekly.reduce((a,b)=>a+b,0),
    growthMedian: growth.length? pct(growth,0.5): null,
    growthPositive: growth.filter(x=>x>0).length,
    new30: ages.filter(x=>x<=30).length,
  };
}

// per-tag stats
const byTag = new Map();
ROWS.forEach(r => (r[9]||[]).forEach(t => { if(!byTag.has(t)) byTag.set(t,[]); byTag.get(t).push(r); }));

let out = '# ECO DATA DIGEST (snapshot ' + M.date + ')\n\n';
out += 'Total repos: ' + ROWS.length + '\n';
out += 'Counts: ' + JSON.stringify(M.counts) + '\n\n';

out += '## PER-TAG STATS\n';
out += '| id | name | fam | n | ★med | ★p90 | weekly med | weekly sum | growth med | +growth | new≤30d |\n';
out += '|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const [t, list] of [...byTag.entries()].sort((a,b)=>b[1].length-a[1].length)) {
  const s = stats(list);
  out += `| ${t} | ${nameOf(t)} | ${famOf(t)} | ${s.n} | ${s.starsMedian??'-'} | ${s.starsP90??'-'} | ${s.weeklyMedian??'-'} | ${s.weeklySum} | ${s.growthMedian??'-'} | ${s.growthPositive} | ${s.new30} |\n`;
}

out += '\n## FAMILY ROLLUP\n';
const famMap = new Map();
TAGS.forEach((t,i)=> { if(!famMap.has(t.fam)) famMap.set(t.fam,[]); famMap.get(t.fam).push(i); });
for (const [fam, ids] of famMap) {
  const set = new Set(); ROWS.forEach(r => (r[9]||[]).forEach(t=>{ if(ids.includes(t)) set.add(r); }));
  const s = stats([...set]);
  out += `- **${fam}** (tags: ${ids.map(nameOf).join(', ')}): repos=${s.n}, ★med=${s.starsMedian}, weekly med=${s.weeklyMedian}, weekly sum=${s.weeklySum}, growth med=${s.growthMedian}, new≤30d=${s.new30}\n`;
}

out += '\n## TOP 60 BY SCORE (main rows)\n';
ROWS.filter(r=>r[10]===1||r[2]>2000).sort((a,b)=>b[1]-a[1]).slice(0,60).forEach((r,i)=>{
  out += `${i+1}. ${r[0]} | score=${r[1]} | ★=${r[2]} | wk=${r[3]} | grow=${r[4]} | age=${r[5]}d | seg=${r[6]} | tags=[${(r[9]||[]).map(nameOf).join(',')}]\n`;
});

out += '\n## MATRIX (parent × capability cell counts)\n';
if (M.matrix) {
  out += 'parents: ' + M.matrix.parents.map(nameOf).join(' | ') + '\n';
  out += 'caps: ' + M.matrix.caps.map(nameOf).join(' | ') + '\n';
  const P=M.matrix.parents, C=M.matrix.caps;
  for (let i=0;i<P.length;i++){
    const row=M.matrix.cells[i]||[];
    out += `${nameOf(P[i])}: ` + row.map((c,j)=> c.n>0 ? `${nameOf(C[j])}=${c.n}` : '').filter(Boolean).join(', ') + '\n';
  }
}

out += '\n## HEAT (tag weekly volume trend, last 26 weeks)\n';
(M.heat||[]).forEach(h => { out += `${nameOf(h.tag)} (total=${h.total}): ${h.cells.join(',')}\n`; });

out += '\n## DOWNLOAD TOP 30\n';
(M.downloadTop||[]).slice(0,30).forEach((x,i)=>{ out += `${i+1}. ${x.repo} wk=${x.weekly} ★=${x.stars} grow=${x.growth}\n`; });

fs.writeFileSync(new URL('./digest.md', import.meta.url), out);
console.log('wrote digest.md, length', out.length);
