const d=require('../eco-data.json'); const R=d.rows;
const T=d.meta.tags; const nm=i=>T[i]?.name||('t'+i);
const show=(r)=>`${r[0]} | ★${r[2]} wk=${r[3]} score=${r[1]} grow=${r[4]} age=${r[5]} tags=[${r[9].map(nm).join(',')}]`;
const G={
 'A_论文阅读与引用': /paper[-_]?(reader|desk|search|writing|agent)|reference[-_]?(checker|anything)|dsh[-_]?cite\b|thesis|dissertation|bibliograph|academic[-_]?(writing|paper)/i,
 'B_课程笔记与讲义': /course[-_]?(note|assistant|workbench|subtitle|sync|plugin)|lecture|handout|courseware|teaching[-_]?(material|plugin)|teacher[-_]?workbench|dsh[-_]?teacher/i,
 'C_备考与测验': /exam|quiz|vocab|dsh[-_]?cet|md[-_]?quiz|homework|flashcard/i,
 'D_学术检索与综述': /academic|scholar|research[-_]?(graph|report|suite|core|skills)|search[-_]?school[-_]?sci|arxiv|literature/i,
 'E_家教陪练与语言': /tutor|teach(er|ing)?[-_]?(kit|math)|socratic|language[-_]?learn|spanish[-_]?tutor/i,
 'F_视频课程与屏幕': /video[-_]?course|course[-_]?subtitle|lecture|manim|screen[-_]?(record|capture)|dsh[-_]?video[-_]?note/i,
 'G_笔记与知识库': /notebook|notes|notewall|sidenote|knowledge|wiki[-_]?note/i,
};
for(const [g,re] of Object.entries(G)){
  const a=R.filter(r=>re.test(r[0]));
  console.log('\n===== '+g+' n='+a.length+' ★sum='+a.reduce((s,r)=>s+(r[2]||0),0)+' wkSum='+a.reduce((s,r)=>s+(r[3]||0),0)+' =====');
  a.sort((x,y)=>(y[3]||0)-(x[3]||0)).slice(0,12).forEach(r=>console.log('  '+show(r)));
}
// distinctive tag combos among edu
const edu=R.filter(r=>/edu|study|learn|teach|paper|thesis|course|exam|quiz|tutor|academic|scholar|research|note|knowledge|vocab|lecture|reference|cite/i.test(r[0])&&!/wallpaper|schedule|already|goodandready|thread|classic|classif|bookmark|handbook|cookbook|lorebook|readme/i.test(r[0]));
console.log('\n===== EDU distinct combos count =====');
const combos={}; edu.forEach(r=>{const k=r[9].slice().sort((a,b)=>a-b).join('+'); combos[k]=(combos[k]||0)+1;});
Object.entries(combos).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,n])=>console.log(' ',k.split('+').map(nm).join('+'),'=',n));
