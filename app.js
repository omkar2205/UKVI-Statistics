const CONFIG = window.UKVI_CONFIG || {};
const API_URL = (CONFIG.API_URL || '').trim();
const BUILD = CONFIG.BUILD || 'local';
const COLORS = { blue:'#1a73e8', green:'#188038', red:'#d93025', amber:'#f9ab00', grey:'#70757a', grid:'#edf1f5' };
const SCOPES = {
  sponsored: { label:'Sponsored Study Only', sub:'Main applicant sponsored study applications and outcomes.' },
  overall: { label:'Overall Study Visa', sub:'All study visa subtypes, including main applicants and dependants.' }
};
let rawData=null, scope='sponsored', charts={};
let state={ apps:[], outs:[], filteredApps:[], filteredOuts:[], years:[], countries:[], rows:[], yearRows:[], countryRows:[] };
const $=id=>document.getElementById(id);
const setText=(id,v)=>{const el=$(id); if(el) el.textContent=v;};
const fmt=v=>Math.round(Number(v)||0).toLocaleString('en-GB');
const rd=v=>Math.round((Number(v)||0)*10)/10;
const pct=v=>rd((Number(v)||0)*100).toFixed(1)+'%';
const pp=v=>v==null?'-':((rd(v*100)>0?'+':'')+rd(v*100).toFixed(1)+' pp');
const pc=v=>v==null?'-':((rd(v*100)>0?'+':'')+rd(v*100).toFixed(1)+'%');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const sum=(a,k)=>a.reduce((t,x)=>t+(+x[k]||0),0);
const uniq=a=>[...new Set(a.filter(v=>v!==''&&v!=null))];

init();

function init(){
  $('menuBtn')?.addEventListener('click',e=>{e.stopPropagation();$('layout')?.classList.toggle('expanded');setTimeout(resizeCharts,200);});
  document.addEventListener('click',e=>{if($('layout')?.classList.contains('expanded')&&!$('sidebar')?.contains(e.target))$('layout').classList.remove('expanded');});
  document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  document.querySelectorAll('.scope').forEach(b=>b.addEventListener('click',()=>setScope(b.dataset.scope)));
  $('applyBtn')?.addEventListener('click',applyFilters);
  $('resetBtn')?.addEventListener('click',resetFilters);
  $('exportBtn')?.addEventListener('click',exportCsv);
  $('compareBtn')?.addEventListener('click',renderCompare);
  $('countrySearch')?.addEventListener('input',renderCountryTable);
  window.addEventListener('resize',resizeCharts);
  loadData();
}

async function loadData(){
  if(!API_URL){setupNotice();$('loading').style.display='none';return;}
  try{
    const url=API_URL+(API_URL.includes('?')?'&':'?')+'v='+encodeURIComponent(BUILD)+'&t='+Date.now();
    const res=await fetch(url,{cache:'no-store'});
    if(!res.ok)throw new Error('Apps Script returned HTTP '+res.status);
    const data=await res.json();
    if(data.status&&data.status!=='ok')throw new Error(data.message||'Apps Script returned an error');
    rawData=data;
    const notice=$('notice'); if(notice){notice.hidden=true;notice.className='notice';notice.textContent='';}
    setScope(scope);
  }catch(err){setNotice('Data connection failed: '+(err.message||err),'error');}
  finally{$('loading').style.display='none';}
}
function setupNotice(){setNotice('Apps Script is not connected yet. The dashboard needs the deployed Apps Script Web App URL in config.js.','error');setText('summaryLine','Waiting for Apps Script Web App URL.');}
function setNotice(text,kind){const n=$('notice');if(!n)return;n.hidden=false;n.className='notice '+(kind||'');n.textContent=text;}

function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===id));
  $('layout')?.classList.remove('expanded');
  setTimeout(resizeCharts,80);
}
function setScope(next){
  scope=next;
  document.querySelectorAll('.scope').forEach(b=>b.classList.toggle('active',b.dataset.scope===scope));
  setText('reportTitle','UKVI Student Visa Statistics');
  setText('reportSubtitle',SCOPES[scope].sub);
  if(!rawData)return;
  const ds=rawData.datasets?.[scope];
  if(!ds){setNotice('No dataset returned for '+scope+'.','error');return;}
  state.apps=(ds.applications||[]).map(r=>({year:+r.year,quarter:String(r.quarter||''),nationality:String(r.nationality||''),applications:+r.applications||0}));
  state.outs=(ds.outcomes||[]).map(r=>({year:+r.year,quarter:String(r.quarter||''),nationality:String(r.nationality||''),outcome:String(r.outcome||'').toLowerCase(),decisions:+r.decisions||0})).filter(r=>r.outcome==='issued'||r.outcome==='refused');
  state.years=uniq(state.apps.map(r=>r.year).concat(state.outs.map(r=>r.year))).sort((a,b)=>a-b);
  state.countries=uniq(state.apps.map(r=>r.nationality).concat(state.outs.map(r=>r.nationality))).sort((a,b)=>a.localeCompare(b));
  populateFilters();
  applyFilters();
}
function populateFilters(){
  fillSelect($('yearFrom'),state.years,state.years[0]);
  fillSelect($('yearTo'),state.years,state.years[state.years.length-1]);
  if($('country'))$('country').innerHTML='<option value="All">All countries</option>'+state.countries.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if($('countryOptions'))$('countryOptions').innerHTML=state.countries.map(c=>`<option value="${esc(c)}"></option>`).join('');
}
function fillSelect(el,vals,selected){if(!el)return;el.innerHTML=vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');el.value=selected;}
function resetFilters(){if(!state.years.length)return;$('yearFrom').value=state.years[0];$('yearTo').value=state.years[state.years.length-1];$('quarter').value='All';$('country').value='All';if($('countrySearch'))$('countrySearch').value='';applyFilters();}
function applyFilters(){
  if(!state.years.length)return;
  const yf=+$('yearFrom').value, yt=+$('yearTo').value, q=$('quarter').value, c=$('country').value;
  state.filteredApps=state.apps.filter(r=>r.year>=yf&&r.year<=yt&&(q==='All'||r.quarter===q)&&(c==='All'||r.nationality===c));
  state.filteredOuts=state.outs.filter(r=>r.year>=yf&&r.year<=yt&&(q==='All'||r.quarter===q)&&(c==='All'||r.nationality===c));
  setText('filterState','Showing: '+[SCOPES[scope].label,yf+' to '+yt,q==='All'?'All quarters':q,c==='All'?'All countries':c].join(' · '));
  buildState();renderAll();
}
function buildState(){
  state.rows=periods(state.filteredApps,state.filteredOuts).map(p=>({label:p.label,year:p.year,quarter:p.quarter,...metrics(state.filteredApps.filter(r=>r.year===p.year&&r.quarter===p.quarter),state.filteredOuts.filter(r=>r.year===p.year&&r.quarter===p.quarter))}));
  state.yearRows=uniq(state.filteredApps.map(r=>r.year).concat(state.filteredOuts.map(r=>r.year))).sort((a,b)=>a-b).map(y=>({label:String(y),year:y,...metrics(state.filteredApps.filter(r=>r.year===y),state.filteredOuts.filter(r=>r.year===y))}));
  state.countryRows=state.countries.map(country=>({label:country,...metrics(state.filteredApps.filter(r=>r.nationality===country),state.filteredOuts.filter(r=>r.nationality===country)),...movement(country)})).filter(r=>r.applications||r.decisions).sort((a,b)=>b.applications-a.applications);
}
function periods(apps,outs){const m=new Map();apps.concat(outs).forEach(r=>m.set(r.year+'|'+r.quarter,{year:r.year,quarter:r.quarter,label:r.year+' '+r.quarter}));return [...m.values()].sort((a,b)=>a.year-b.year||Number(a.quarter[1])-Number(b.quarter[1]));}
function metrics(apps,outs){const applications=sum(apps,'applications'),issued=sum(outs.filter(r=>r.outcome==='issued'),'decisions'),refused=sum(outs.filter(r=>r.outcome==='refused'),'decisions'),decisions=issued+refused;return{applications,issued,refused,decisions,grantRate:decisions?issued/decisions:0,refusalRate:decisions?refused/decisions:0};}
function movement(country){
  const years=uniq(state.apps.concat(state.outs).filter(r=>r.nationality===country).map(r=>r.year)).sort((a,b)=>a-b), cy=years.at(-1), py=cy-1;
  if(!cy||!py)return{appChange:null,grantChange:null,refusalChange:null,movement:'– Insufficient Data',movementClass:'text-neutral'};
  const cur=metrics(state.apps.filter(r=>r.nationality===country&&r.year===cy),state.outs.filter(r=>r.nationality===country&&r.year===cy));
  const prev=metrics(state.apps.filter(r=>r.nationality===country&&r.year===py),state.outs.filter(r=>r.nationality===country&&r.year===py));
  if(!prev.applications&&!prev.decisions)return{appChange:null,grantChange:null,refusalChange:null,movement:'– Insufficient Data',movementClass:'text-neutral'};
  const appChange=prev.applications?(cur.applications-prev.applications)/prev.applications:null;
  const grantChange=prev.issued?(cur.issued-prev.issued)/prev.issued:null;
  const refusalChange=cur.refusalRate-prev.refusalRate;
  const up=appChange>.05,down=appChange<-.05,grantsUp=grantChange>.05,grantsDown=grantChange<-.05,better=refusalChange<-.005,worse=refusalChange>.005;
  if(up&&grantsUp&&better)return{appChange,grantChange,refusalChange,movement:'↗ Positive Growth',movementClass:'text-good'};
  if(up&&better)return{appChange,grantChange,refusalChange,movement:'↗ Higher Volume, Better Outcome',movementClass:'text-good'};
  if(down&&better)return{appChange,grantChange,refusalChange,movement:'↘ Lower Volume, Better Outcome',movementClass:'text-good'};
  if(up&&worse)return{appChange,grantChange,refusalChange,movement:'⚠ Higher Volume, Higher Risk',movementClass:'text-warn'};
  if((down&&worse)||(grantsDown&&worse))return{appChange,grantChange,refusalChange,movement:'↓ Declining',movementClass:'text-risk'};
  return{appChange,grantChange,refusalChange,movement:'→ Stable / Mixed',movementClass:'text-warn'};
}

function renderAll(){
  const total=metrics(state.filteredApps,state.filteredOuts);
  setText('summaryLine',`${SCOPES[scope].label}: ${fmt(total.applications)} applications, ${fmt(total.decisions)} decisions considered, ${pct(total.grantRate)} grant rate and ${pct(total.refusalRate)} refusal rate.`);
  renderOverviewKpis(total);renderApplicationsKpis();renderOutcomesKpis(total);renderGrantsKpis(total);renderRefusalsKpis(total);renderMini();renderCharts(total);renderCountryTable();renderCompare();
}
function kpis(id,items){const el=$(id);if(!el)return;el.innerHTML=items.map(x=>`<div class="kpi ${x[3]||'blue'}"><div class="kpi-label">${x[0]}</div><div class="kpi-value">${x[1]}</div><div class="kpi-sub">${x[2]}</div></div>`).join('');}
function renderOverviewKpis(t){kpis('overviewKpis',[['Applications',fmt(t.applications),'Application volume','blue'],['Decisions',fmt(t.decisions),'Issued + refused','grey'],['Issued / Granted',fmt(t.issued),'Successful outcomes','green'],['Refused',fmt(t.refused),'Refused outcomes','red'],['Grant Rate',pct(t.grantRate),'Issued ÷ decisions','green'],['Refusal Rate',pct(t.refusalRate),'Refused ÷ decisions','red']]);}
function renderApplicationsKpis(){const apps=state.filteredApps,yrs=uniq(apps.map(r=>r.year)),total=sum(apps,'applications'),yearTop=top(group(apps,'year','applications')),countryTop=top(group(apps,'nationality','applications')),latest=state.rows.at(-1);kpis('applicationsKpis',[['Total Applications',fmt(total),'Selected volume','blue'],['Average / Year',fmt(yrs.length?total/yrs.length:0),'Selected years','grey'],['Countries Included',fmt(uniq(apps.map(r=>r.nationality)).length),'With applications','grey'],['Highest Year',yearTop?.label||'-',fmt(yearTop?.value||0)+' applications','blue'],['Highest Country',countryTop?.label||'-',fmt(countryTop?.value||0)+' applications','blue'],['Latest Period',latest?fmt(latest.applications):'-',latest?.label||'No period','grey']]);}
function renderOutcomesKpis(t){kpis('outcomesKpis',[['Total Decisions',fmt(t.decisions),'Issued + refused','grey'],['Issued / Granted',fmt(t.issued),'Successful outcomes','green'],['Refused',fmt(t.refused),'Refused outcomes','red'],['Grant Rate',pct(t.grantRate),'Issued ÷ decisions','green'],['Refusal Rate',pct(t.refusalRate),'Refused ÷ decisions','red']]);}
function renderGrantsKpis(t){const topGrant=top(state.countryRows.slice().sort((a,b)=>b.issued-a.issued).map(r=>({label:r.label,value:r.issued})));const bestRate=state.countryRows.filter(r=>r.decisions>=30).sort((a,b)=>b.grantRate-a.grantRate)[0];const latest=state.rows.at(-1);kpis('grantsKpis',[['Issued / Granted',fmt(t.issued),'Successful outcomes','green'],['Grant Rate',pct(t.grantRate),'Issued ÷ decisions','green'],['Top Grant Country',topGrant?.label||'-',fmt(topGrant?.value||0)+' issued','green'],['Best Grant Rate',bestRate?.label||'-',bestRate?pct(bestRate.grantRate):'Min. decisions','green'],['Latest Grants',latest?fmt(latest.issued):'-',latest?.label||'No period','grey']]);}
function renderRefusalsKpis(t){const topVol=state.countryRows.slice().sort((a,b)=>b.refused-a.refused)[0];const highRate=state.countryRows.filter(r=>r.decisions>=30).sort((a,b)=>b.refusalRate-a.refusalRate)[0];const latest=state.rows.at(-1),prev=state.rows.find(r=>latest&&r.year===latest.year-1&&r.quarter===latest.quarter),mov=latest&&prev?latest.refusalRate-prev.refusalRate:null;kpis('refusalsKpis',[['Refused',fmt(t.refused),'Refused outcomes','red'],['Refusal Rate',pct(t.refusalRate),'Refused ÷ decisions','red'],['Top Refusal Volume',topVol?.label||'-',fmt(topVol?.refused||0)+' refused','red'],['Highest Refusal Rate',highRate?.label||'-',highRate?pct(highRate.refusalRate):'Min. decisions','red'],['Latest Movement',pp(mov),latest?latest.label:'No period',mov>0?'red':'green']]);}
function renderMini(){const latest=state.rows.at(-1),prev=state.rows.find(r=>latest&&r.year===latest.year-1&&r.quarter===latest.quarter),refMove=latest&&prev?latest.refusalRate-prev.refusalRate:null,appTop=state.countryRows[0],highRisk=state.countryRows.filter(r=>r.decisions>=30).sort((a,b)=>b.refusalRate-a.refusalRate)[0];$('miniGrid').innerHTML=[['Latest Period',latest?latest.label:'-',''],['Latest Refusal Movement',pp(refMove),refMove>0?'risk':'good'],['Top Application Country',appTop?`${esc(appTop.label)} · ${fmt(appTop.applications)}`:'-',''],['Highest Refusal Rate',highRisk?`${esc(highRisk.label)} · ${pct(highRisk.refusalRate)}`:'-','risk']].map(x=>`<div class="mini-card"><span>${x[0]}</span><b class="${x[2]}">${x[1]}</b></div>`).join('');}
function group(arr,key,val){const m={};arr.forEach(r=>{const label=key==='year'?String(r.year):r[key];m[label]=m[label]||{label,value:0};m[label].value+=+r[val]||0;});return Object.values(m);}function top(arr){return arr&&arr.length?arr.sort((a,b)=>b.value-a.value)[0]:null;}
function topCountry(key){return state.countryRows.slice().sort((a,b)=>b[key]-a[key]).slice(0,15).map(r=>({label:r.label,value:r[key]}));}

function renderCharts(t){
  combo('chartAnnual',state.yearRows,['applications','decisions'],['Applications','Decisions'],[COLORS.blue,COLORS.grey]);
  line('chartRefusalRate',state.yearRows,'refusalRate',COLORS.red,true);
  latestSlope(); pie('chartOutcomeMixOverview',t); pie('chartOutcomeMix',t);
  bar('chartYearApps',state.yearRows,'applications',COLORS.blue); bar('chartQuarterApps',state.rows,'applications',COLORS.blue); hbar('chartTopApps',topCountry('applications'),COLORS.blue);
  combo('chartOutcomeYear',state.yearRows,['issued','refused'],['Issued / Granted','Refused'],[COLORS.green,COLORS.red]); combo('chartQuarterOutcomes',state.rows,['issued','refused'],['Issued / Granted','Refused'],[COLORS.green,COLORS.red]);
  bar('chartGrantTrend',state.yearRows,'issued',COLORS.green); line('chartGrantRate',state.yearRows,'grantRate',COLORS.green,true); hbar('chartTopGrants',topCountry('issued'),COLORS.green);
  bar('chartRefusalTrend',state.yearRows,'refused',COLORS.red); hbar('chartHighRefusal',state.countryRows.filter(r=>r.decisions>=30).sort((a,b)=>b.refusalRate-a.refusalRate).slice(0,15).map(r=>({label:r.label,value:rd(r.refusalRate*100)})),COLORS.red,'%'); hbar('chartRefusalIncrease',state.countryRows.filter(r=>r.refusalChange>0).sort((a,b)=>b.refusalChange-a.refusalChange).slice(0,15).map(r=>({label:r.label,value:rd(r.refusalChange*100)})),COLORS.red,' pp');
}
function base(){return{tooltip:{trigger:'axis'},grid:{left:54,right:22,top:28,bottom:50},legend:{bottom:0},xAxis:{type:'category'},yAxis:{type:'value',splitLine:{lineStyle:{color:COLORS.grid}}}};}
function getChart(id){const el=$(id);if(!el)return null;if(!charts[id])charts[id]=echarts.init(el);return charts[id];}
function setChart(id,opt){const c=getChart(id);if(c)c.setOption(opt,true);}function resizeCharts(){Object.values(charts).forEach(c=>c&&c.resize());}
function bar(id,rows,key,color){setChart(id,{...base(),xAxis:{type:'category',data:rows.map(r=>r.label),axisLabel:{rotate:rows.length>10?35:0}},series:[{type:'bar',data:rows.map(r=>r[key]),itemStyle:{color}}]});}
function line(id,rows,key,color,rate){setChart(id,{...base(),xAxis:{type:'category',data:rows.map(r=>r.label)},yAxis:{type:'value',axisLabel:rate?{formatter:'{value}%'}:{}},series:[{type:'line',data:rows.map(r=>rate?rd(r[key]*100):r[key]),symbolSize:6,lineStyle:{color,width:3},itemStyle:{color}}]});}
function combo(id,rows,keys,names,colors){setChart(id,{...base(),xAxis:{type:'category',data:rows.map(r=>r.label),axisLabel:{rotate:rows.length>10?35:0}},series:keys.map((k,i)=>({name:names[i],type:'bar',data:rows.map(r=>r[k]),itemStyle:{color:colors[i]}}))});}
function hbar(id,rows,color,suffix=''){const d=rows.slice().reverse();setChart(id,{tooltip:{trigger:'axis',valueFormatter:v=>v+suffix},grid:{left:160,right:20,top:20,bottom:30},xAxis:{type:'value',splitLine:{lineStyle:{color:COLORS.grid}}},yAxis:{type:'category',data:d.map(r=>r.label)},series:[{type:'bar',data:d.map(r=>r.value),itemStyle:{color}}]});}
function pie(id,t){setChart(id,{color:[COLORS.green,COLORS.red],tooltip:{trigger:'item'},legend:{bottom:0},series:[{type:'pie',radius:['48%','70%'],data:[{name:'Issued / Granted',value:t.issued},{name:'Refused',value:t.refused}]}]});}
function latestSlope(){const latest=state.rows.at(-1),prev=state.rows.find(r=>latest&&r.year===latest.year-1&&r.quarter===latest.quarter);if(!latest||!prev){setChart('chartLatestSlope',{title:{text:'No comparable period',left:'center',top:'middle',textStyle:{fontSize:13,color:COLORS.grey}}});return;}setChart('chartLatestSlope',{...base(),xAxis:{type:'category',data:[prev.label,latest.label]},yAxis:{type:'value',axisLabel:{formatter:'{value}%'}},series:[{type:'line',data:[rd(prev.refusalRate*100),rd(latest.refusalRate*100)],label:{show:true,formatter:'{c}%'},symbolSize:10,lineStyle:{color:COLORS.red,width:3},itemStyle:{color:COLORS.red}}]});}

function renderCountryTable(){
  const q=($('countrySearch')?.value||'').trim().toLowerCase();
  const rows=state.countryRows.filter(r=>!q||r.label.toLowerCase().includes(q));
  $('countryTable').innerHTML=`<table><thead><tr><th>Nationality</th><th>Applications</th><th>Decisions</th><th>Issued</th><th>Refused</th><th>Grant Rate</th><th>Refusal Rate</th><th>Application Change</th><th>Grant Change</th><th>Refusal Rate Change</th><th>Movement</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${fmt(r.applications)}</td><td>${fmt(r.decisions)}</td><td>${fmt(r.issued)}</td><td>${fmt(r.refused)}</td><td>${pct(r.grantRate)}</td><td>${pct(r.refusalRate)}</td><td>${pc(r.appChange)}</td><td>${pc(r.grantChange)}</td><td>${pp(r.refusalChange)}</td><td><span class="${r.movementClass}">${esc(r.movement)}</span></td></tr>`).join('')}</tbody></table>`;
}
function renderCompare(){
  if(!state.countryRows.length)return;
  const countries=uniq([...document.querySelectorAll('.compare-country')].map(i=>i.value.trim()).filter(v=>v&&state.countries.includes(v))).slice(0,5);
  const metric=$('compareMetric')?.value||'refusalRate';
  const rows=countries.map(c=>state.countryRows.find(r=>r.label===c)).filter(Boolean);
  const data=rows.map(r=>({label:r.label,value:metric.includes('Rate')?rd(r[metric]*100):r[metric]}));
  setChart('chartCompare',{...base(),xAxis:{type:'category',data:data.map(r=>r.label)},yAxis:{type:'value',axisLabel:metric.includes('Rate')?{formatter:'{value}%'}:{}},series:[{type:'bar',data:data.map(r=>r.value),itemStyle:{color:metric==='refusalRate'?COLORS.red:metric==='grantRate'?COLORS.green:COLORS.blue}}]});
  $('compareTable').innerHTML=`<table><thead><tr><th>Country</th><th>${esc(metric)}</th><th>Applications</th><th>Decisions</th><th>Grant Rate</th><th>Refusal Rate</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${metric.includes('Rate')?pct(r[metric]):fmt(r[metric])}</td><td>${fmt(r.applications)}</td><td>${fmt(r.decisions)}</td><td>${pct(r.grantRate)}</td><td>${pct(r.refusalRate)}</td></tr>`).join('')}</tbody></table>`;
}
function exportCsv(){const rows=[['Nationality','Applications','Decisions','Issued','Refused','Grant Rate','Refusal Rate','Application Change','Grant Change','Refusal Rate Change','Movement']].concat(state.countryRows.map(r=>[r.label,r.applications,r.decisions,r.issued,r.refused,pct(r.grantRate),pct(r.refusalRate),pc(r.appChange),pc(r.grantChange),pp(r.refusalChange),r.movement]));const csv=rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ukvi-country-summary.csv';a.click();URL.revokeObjectURL(url);}
