const d=require('../eco-data.json');const rows=d.rows;
const TAG=id=>d.meta.tags[id]?d.meta.tags[id].name:('#'+id);
const has=(r,id)=>(r[9]||[]).includes(id);
const ALLKW=['med','medical','medic','clinic','clinical','patient','health','healthcare','hospital','doctor','nurse','pharma','pharmacy','drug','diagnos','disease','symptom','therapy','therapist','treatment','surgery','care','emr','ehr','icd','dicom','radiology','pathology','lab','biomed','bio-med','genom','vital','dental','dentist','eye','ophthal','cardio','oncolog','pediatric','psych','mental','wellness','fitness','nutrition','diet','sleep','rehab','nursing','ambulance','telemed','telehealth','tele-health','telemedicine','pacs','hl7','fhir','snomed','icu','mri','ct-scan','ultrasound','ecg','eeg','glucose','diabet','cancer','tumor','vaccine','triage','prescription','rx','telecare','caregiver','elder','geriatric','maternal','pregnan','gyneco','derma','dermat','ortho','rheumat','allerg','immun','infect','sepsis','covid','fever','pain','wound','prognos','risk-score','bio','clinicaltrial','clinical-trial','vet'];
const CLIN=['medical','medic','clinic','patient','hospital','pharma','drug','diagnos','disease','icd','hl7','fhir','mri','ecg','eeg','glucose','diabet','cancer','tumor','vaccine','dental','cardio','prescription','nurs','vet-clinic','prenatal','food-therapy','baby-fever','travel-med','industry-medical','medical-literature','knowledge-graph','heart-health','pharma-review','med-plugin','med-','biomed','genom','patholog','radiolog','ultrasound','ophthal','oncolog','pediatric','geriatric','gyneco','dermat','ortho','prognos','clinicaltrial','clinical-trial','telemed','telehealth','pacs','snomed','emr','ehr','symptom','therapy','treatment','surgery','sepsis','wound','fever','immun','infect','rheumat','allerg','ambulance','caregiver'];
const WELL=['health','healthcare','wellness','fitness','nutrition','diet','sleep','rehab','elder','care','vital'];
const TOOL=['doctor','triage','repo-health','session-health','model-health','ops-health','mcp-health','attention-health','slot-health','disk-doctor','token-diet','context-diet','budget-health','bid-health-check','mcp-doctor','plugin-doctor','env-doctor','ci-doctor','skill-doctor','context-doctor','memory-doctor','mail-triage','log-triage','crash-triage','backlog-triage','conflict-triage','har-triage','batch-triage','dv-triage'];
function hit(n,list){return list.filter(k=>new RegExp('(^|[^a-z0-9])'+k+'([^a-z0-9]|$)','i').test(n));}
const raw=rows.filter(r=>hit(r[0].toLowerCase(),ALLKW).length>0);
const clinical=[],wellness=[];
raw.forEach(r=>{const n=r[0].toLowerCase();const c=hit(n,CLIN).length>0,w=hit(n,WELL).length>0,t=hit(n,TOOL).length>0;
  if(c)clinical.push(r); else if(!t&&w)wellness.push(r);});
const health=clinical.concat(wellness);
console.log(`health n=${health.length} (clinical ${clinical.length}, wellness ${wellness.length})`);
[8,10,39,36,9,5,13,22,28,30,31,42,34,35,46].forEach(id=>{
  const h=health.filter(r=>has(r,id)).length;
  const g=rows.filter(r=>has(r,id)).length;
  console.log(`  ${id} ${TAG(id)}: health=${h} | global=${g}`);
});
const any=health.filter(r=>[8,10,39,36].some(id=>has(r,id)));
console.log(`health with ANY {8,10,39,36}: ${any.length}/${health.length}`);
console.log('detail:');
any.sort((a,b)=>b[1]-a[1]).forEach(r=>console.log(`  ${r[0]} sc=${r[1]} [${(r[9]||[]).map(TAG).join('/')}]`));
