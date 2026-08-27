const CONFIG = window.UKVI_CONFIG || {};
const API_URL = (CONFIG.API_URL || '').trim();
const BUILD = CONFIG.BUILD || 'local';
const COLORS = { blue:'#2f80c0', green:'#15836f', red:'#c0392b', amber:'#a16207', grey:'#64748b', grid:'#e5eaf0' };
const SCOPES = {
  sponsored: { title:'Sponsored Study Only', sub:'Main applicant sponsored study applications and outcomes.' },
  overall: { title:'Overall Study Visa', sub:'All study visa subtypes, including main applicants and dependants.' }
};
let rawData = null;
let scope = 'sponsored';
let state = { apps:[], outs:[], filteredApps:[], filteredOuts:[], years:[], countries:[], rows:[], countryRows:[] };
let charts = {};

const $ = id => document.getElementById(id);
const fmt = v => Math.round(Number(v)||0).toLocaleString('en-GB');
const rd = v => Math.round((Number(v)||0)*10)/10;
const pct = v => rd((Number(v)||0)*100).toFixed(1)+'%';
const pp = v => (v == null ? '-' : ((rd(v*100)>0?'+':'')+rd(v*100).toFixed(1)+' pp'));
const pc = v => (v == null ? '-' : ((rd(v*100)>0?'+':'')+rd(v*100).toFixed(1)+'%'));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const sum = (arr, key) => arr.reduce((t, r) => t + (+r[key] || 0), 0);
const uniq = arr => [...new Set(arr.filter(v => v !== '' && v != null))];

init();

function init(){
  $('menuBtn').addEventListener('click', () => {
    $('layout').classList.toggle('collapsed');
    $('layout').classList.toggle('sidebar-open');
    setTimeout(resizeCharts, 220);
  });
  document.querySelectorAll('.nav').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  document.querySelectorAll('.scope').forEach(btn => btn.addEventListener('click', () => setScope(btn.dataset.scope)));
  $('applyBtn').addEventListener('click', applyFilters);
  $('resetBtn').addEventListener('click', resetFilters);
  $('exportBtn').addEventListener('click', exportCsv);
  $('compareBtn').addEventListener('click', renderCompare);
  window.addEventListener('resize', resizeCharts);
  loadData();
}

async function loadData(){
  if(!API_URL){
    setupNotice();
    $('loading').style.display='none';
    return;
  }
  try{
    setNotice('Connecting to Google Apps Script...', '');
    const url = API_URL + (API_URL.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(BUILD) + '&t=' + Date.now();
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('Apps Script returned HTTP '+res.status);
    const data = await res.json();
    if(data.status && data.status !== 'ok') throw new Error(data.message || 'Apps Script returned an error');
    rawData = data;
    $('connectionLabel').textContent = 'Connected to Google Sheets';
    $('topMeta').textContent = data.updatedAt ? 'Loaded '+new Date(data.updatedAt).toLocaleString('en-GB') : 'Connected';
    $('debugInfo').textContent = connectionSummary(data);
    setNotice('Google Sheets connection is active. Data is now coming from Apps Script, not the Excel file in GitHub.', 'success');
    setScope(scope);
  }catch(err){
    setNotice('Data connection failed: '+(err.message || err), 'error');
    $('debugInfo').textContent = 'Connection failed: '+(err.message || err);
  }finally{
    $('loading').style.display='none';
  }
}

function setupNotice(){
  setNotice('Apps Script is not connected yet. The design is ready, but config.js needs the deployed Apps Script Web App URL. Deploy apps-script/Code.gs as a web app, then paste the /exec URL into config.js.', 'error');
  $('summaryLine').textContent = 'Waiting for Apps Script Web App URL.';
  $('debugInfo').innerHTML = 'API_URL is empty in config.js. Use the backend code in apps-script/Code.gs, deploy it, then update config.js.';
}

function setNotice(text, kind){
  const n = $('notice');
  n.hidden = false;
  n.className = 'notice' + (kind ? ' '+kind : '');
  n.textContent = text;
}

function connectionSummary(data){
  const s = data.source || {};
  const d = data.datasets || {};
  const parts = [];
  parts.push('Spreadsheet: '+(s.title || s.spreadsheetId || 'Google Sheet'));
  Object.keys(d).forEach(k => {
    const a = d[k].applications || [], o = d[k].outcomes || [];
    parts.push(k+': '+a.length+' application rows, '+o.length+' outcome rows');
  });
  return parts.join(' | ');
}

function showView(id){
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === id));
  $('layout').classList.remove('sidebar-open');
  setTimeout(resizeCharts, 80);
}

function setScope(next){
  scope = next;
  document.querySelectorAll('.scope').forEach(b => b.classList.toggle('active', b.dataset.scope === scope));
  $('reportTitle').textContent = SCOPES[scope].title;
  $('reportSubtitle').textContent = SCOPES[scope].sub;
  if(!rawData) return;
  const ds = rawData.datasets?.[scope];
  if(!ds){ setNotice('No dataset returned for '+scope+'.', 'error'); return; }
  state.apps = (ds.applications || []).map(cleanApplication);
  state.outs = (ds.outcomes || []).map(cleanOutcome).filter(r => r.outcome === 'issued' || r.outcome === 'refused');
  state.years = uniq(state.apps.map(r=>r.year).concat(state.outs.map(r=>r.year))).sort((a,b)=>a-b);
  state.countries = uniq(state.apps.map(r=>r.nationality).concat(state.outs.map(r=>r.nationality))).sort((a,b)=>a.localeCompare(b));
  populateFilters();
  applyFilters();
}

function cleanApplication(r){return {year:+r.year, quarter:String(r.quarter||''), nationality:String(r.nationality||''), applications:+r.applications||0};}
function cleanOutcome(r){return {year:+r.year, quarter:String(r.quarter||''), nationality:String(r.nationality||''), outcome:String(r.outcome||'').toLowerCase(), decisions:+r.decisions||0};}

function populateFilters(){
  fillSelect($('yearFrom'), state.years, state.years[0]);
  fillSelect($('yearTo'), state.years, state.years[state.years.length-1]);
  $('country').innerHTML = '<option value="All">All countries</option>' + state.countries.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $('countryOptions').innerHTML = state.countries.map(c => `<option value="${esc(c)}"></option>`).join('');
}

function fillSelect(el, values, selected){
  el.innerHTML = values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  el.value = selected;
}

function resetFilters(){
  if(!state.years.length) return;
  $('yearFrom').value = state.years[0];
  $('yearTo').value = state.years[state.years.length-1];
  $('quarter').value = 'All';
  $('country').value = 'All';
  applyFilters();
}

function applyFilters(){
  if(!state.years.length) return;
  const yf = +$('yearFrom').value, yt = +$('yearTo').value, q = $('quarter').value, c = $('country').value;
  state.filteredApps = state.apps.filter(r => r.year>=yf && r.year<=yt && (q==='All'||r.quarter===q) && (c==='All'||r.nationality===c));
  state.filteredOuts = state.outs.filter(r => r.year>=yf && r.year<=yt && (q==='All'||r.quarter===q) && (c==='All'||r.nationality===c));
  $('filterState').textContent = 'Current filters: ' + [yf+' to '+yt, q==='All'?'':q, c==='All'?'All countries':c].filter(Boolean).join(' | ');
  buildState();
  renderAll();
}

function buildState(){
  state.rows = periods(state.filteredApps, state.filteredOuts).map(p => ({ label:p.label, year:p.year, quarter:p.quarter, ...metrics(state.filteredApps.filter(r=>r.year===p.year && r.quarter===p.quarter), state.filteredOuts.filter(r=>r.year===p.year && r.quarter===p.quarter)) }));
  state.yearRows = uniq(state.filteredApps.map(r=>r.year).concat(state.filteredOuts.map(r=>r.year))).sort((a,b)=>a-b).map(y => ({ label:String(y), year:y, ...metrics(state.filteredApps.filter(r=>r.year===y), state.filteredOuts.filter(r=>r.year===y)) }));
  state.countryRows = state.countries.map(country => {
    const row = { label:country, ...metrics(state.filteredApps.filter(r=>r.nationality===country), state.filteredOuts.filter(r=>r.nationality===country)) };
    return {...row, ...movement(country)};
  }).filter(r => r.applications || r.decisions).sort((a,b)=>b.applications-a.applications);
}

function periods(apps, outs){
  const m = new Map();
  apps.concat(outs).forEach(r => {
    const key = r.year+'|'+r.quarter;
    m.set(key, {year:r.year, quarter:r.quarter, label:r.year+' '+r.quarter});
  });
  return [...m.values()].sort((a,b)=>a.year-b.year || Number(a.quarter[1])-Number(b.quarter[1]));
}

function metrics(apps, outs){
  const applications = sum(apps,'applications');
  const issued = sum(outs.filter(r=>r.outcome==='issued'), 'decisions');
  const refused = sum(outs.filter(r=>r.outcome==='refused'), 'decisions');
  const decisions = issued + refused;
  return { applications, issued, refused, decisions, grantRate:decisions?issued/decisions:0, refusalRate:decisions?refused/decisions:0 };
}

function movement(country){
  const allYears = uniq(state.apps.concat(state.outs).filter(r=>r.nationality===country).map(r=>r.year)).sort((a,b)=>a-b);
  const cy = allYears[allYears.length-1], py = cy - 1;
  if(!cy || !py) return { appChange:null, grantChange:null, refusalChange:null, movement:'– Insufficient Data', movementClass:'text-neutral' };
  const cur = metrics(state.apps.filter(r=>r.nationality===country && r.year===cy), state.outs.filter(r=>r.nationality===country && r.year===cy));
  const prev = metrics(state.apps.filter(r=>r.nationality===country && r.year===py), state.outs.filter(r=>r.nationality===country && r.year===py));
  if(!prev.applications && !prev.decisions) return { appChange:null, grantChange:null, refusalChange:null, movement:'– Insufficient Data', movementClass:'text-neutral' };
  const appChange = prev.applications ? (cur.applications-prev.applications)/prev.applications : null;
  const grantChange = prev.issued ? (cur.issued-prev.issued)/prev.issued : null;
  const refusalChange = cur.refusalRate - prev.refusalRate;
  const up = appChange > .05, down = appChange < -.05, grantsUp = grantChange > .05, grantsDown = grantChange < -.05, better = refusalChange < -.005, worse = refusalChange > .005;
  if(up && grantsUp && better) return {appChange, grantChange, refusalChange, movement:'↗ Positive Growth', movementClass:'text-good'};
  if(up && better) return {appChange, grantChange, refusalChange, movement:'↗ Higher Volume, Better Outcome', movementClass:'text-good'};
  if(down && better) return {appChange, grantChange, refusalChange, movement:'↘ Lower Volume, Better Outcome', movementClass:'text-good'};
  if(up && worse) return {appChange, grantChange, refusalChange, movement:'⚠ Higher Volume, Higher Risk', movementClass:'text-warn'};
  if((down && worse) || (grantsDown && worse)) return {appChange, grantChange, refusalChange, movement:'↓ Declining', movementClass:'text-risk'};
  return {appChange, grantChange, refusalChange, movement:'→ Stable / Mixed', movementClass:'text-warn'};
}

function renderAll(){
  const total = metrics(state.filteredApps, state.filteredOuts);
  $('summaryLine').textContent = `${SCOPES[scope].title}: ${fmt(total.applications)} applications, ${fmt(total.decisions)} decisions considered, ${pct(total.grantRate)} grant rate and ${pct(total.refusalRate)} refusal rate.`;
  renderKpis(total);
  renderMini(total);
  renderCharts(total);
  renderCountryTable();
  renderCompare();
}

function renderKpis(t){
  const items = [
    ['Applications', fmt(t.applications), 'Application volume', 'blue'],
    ['Decisions', fmt(t.decisions), 'Issued + refused', 'grey'],
    ['Issued / Granted', fmt(t.issued), 'Successful outcomes', 'green'],
    ['Refused', fmt(t.refused), 'Refused outcomes', 'red'],
    ['Grant Rate', pct(t.grantRate), 'Issued ÷ decisions', 'green'],
    ['Refusal Rate', pct(t.refusalRate), 'Refused ÷ decisions', 'red']
  ];
  $('kpiGrid').innerHTML = items.map(x => `<div class="kpi ${x[3]}"><div class="kpi-label">${x[0]}</div><div class="kpi-value">${x[1]}</div><div class="kpi-sub">${x[2]}</div></div>`).join('');
}

function renderMini(){
  const latest = state.rows[state.rows.length-1], prev = state.rows.find(r => latest && r.year === latest.year-1 && r.quarter === latest.quarter);
  const refMove = latest && prev ? latest.refusalRate - prev.refusalRate : null;
  const appTop = state.countryRows[0];
  const highRisk = state.countryRows.filter(r=>r.decisions>=30).sort((a,b)=>b.refusalRate-a.refusalRate)[0];
  $('miniGrid').innerHTML = [
    ['Latest period', latest ? latest.label : '-', ''],
    ['Latest refusal movement', pp(refMove), refMove>0?'risk':'good'],
    ['Top application country', appTop ? `${esc(appTop.label)} · ${fmt(appTop.applications)}` : '-', ''],
    ['Highest refusal rate', highRisk ? `${esc(highRisk.label)} · ${pct(highRisk.refusalRate)}` : '-', highRisk?'risk':'']
  ].map(x => `<div class="mini-card"><span>${x[0]}</span><b class="${x[2]}">${x[1]}</b></div>`).join('');
}

function renderCharts(t){
  barLine('chartAnnual', state.yearRows, ['applications','decisions'], ['Applications','Decisions'], [COLORS.blue, COLORS.grey]);
  line('chartRefusalRate', state.yearRows, 'refusalRate', COLORS.red, true);
  latestSlope();
  bar('chartQuarterApps', state.rows, 'applications', COLORS.blue);
  bar('chartYearApps', state.yearRows, 'applications', COLORS.blue);
  hbar('chartTopApps', topCountry('applications'), COLORS.blue);
  barLine('chartOutcomeYear', state.yearRows, ['issued','refused'], ['Issued / Granted','Refused'], [COLORS.green, COLORS.red]);
  pie('chartOutcomeMix', t);
  barLine('chartQuarterOutcomes', state.rows, ['issued','refused'], ['Issued / Granted','Refused'], [COLORS.green, COLORS.red]);
  bar('chartGrantTrend', state.yearRows, 'issued', COLORS.green);
  line('chartGrantRate', state.yearRows, 'grantRate', COLORS.green, true);
  hbar('chartTopGrants', topCountry('issued'), COLORS.green);
  bar('chartRefusalTrend', state.yearRows, 'refused', COLORS.red);
  hbar('chartHighRefusal', state.countryRows.filter(r=>r.decisions>=30).sort((a,b)=>b.refusalRate-a.refusalRate).slice(0,15).map(r=>({label:r.label,value:rd(r.refusalRate*100)})), COLORS.red, '%');
  hbar('chartRefusalIncrease', state.countryRows.filter(r=>r.refusalChange>0).sort((a,b)=>b.refusalChange-a.refusalChange).slice(0,15).map(r=>({label:r.label,value:rd(r.refusalChange*100)})), COLORS.red, ' pp');
}

function optionBase(){return {tooltip:{trigger:'axis'},grid:{left:55,right:20,top:28,bottom:52},legend:{bottom:0},xAxis:{type:'category'},yAxis:{type:'value',splitLine:{lineStyle:{color:COLORS.grid}}}};}
function getChart(id){const el=$(id); if(!el) return null; if(!charts[id]) charts[id]=echarts.init(el); return charts[id];}
function setChart(id, option){const c=getChart(id); if(c) c.setOption(option, true);}
function resizeCharts(){Object.values(charts).forEach(c=>c&&c.resize());}

function bar(id, rows, key, color){
  setChart(id, {...optionBase(), xAxis:{type:'category',data:rows.map(r=>r.label),axisLabel:{rotate:rows.length>10?35:0}}, series:[{type:'bar',data:rows.map(r=>r[key]),itemStyle:{color}}]});
}
function line(id, rows, key, color, rate){
  setChart(id, {...optionBase(), xAxis:{type:'category',data:rows.map(r=>r.label)}, yAxis:{type:'value',axisLabel:rate?{formatter:'{value}%'}:{}}, series:[{type:'line',smooth:false,symbolSize:7,data:rows.map(r=>rate?rd(r[key]*100):r[key]),lineStyle:{color,width:3},itemStyle:{color}}]});
}
function barLine(id, rows, keys, names, colors){
  setChart(id, {...optionBase(), xAxis:{type:'category',data:rows.map(r=>r.label),axisLabel:{rotate:rows.length>10?35:0}}, series:keys.map((k,i)=>({name:names[i],type:'bar',data:rows.map(r=>r[k]),itemStyle:{color:colors[i]}}))});
}
function latestSlope(){
  const latest = state.rows[state.rows.length-1];
  const prev = state.rows.find(r => latest && r.year === latest.year-1 && r.quarter === latest.quarter);
  if(!latest || !prev){setChart('chartLatestSlope',{title:{text:'No comparable period',left:'center',top:'middle',textStyle:{fontSize:13,color:COLORS.grey}}}); return;}
  setChart('chartLatestSlope', {...optionBase(), xAxis:{type:'category',data:[prev.label, latest.label]}, yAxis:{type:'value',axisLabel:{formatter:'{value}%'}}, series:[{type:'line',data:[rd(prev.refusalRate*100),rd(latest.refusalRate*100)],label:{show:true,formatter:'{c}%'},symbolSize:10,lineStyle:{color:COLORS.red,width:3},itemStyle:{color:COLORS.red}}]});
}
function hbar(id, rows, color, suffix=''){
  const d = rows.slice().reverse();
  setChart(id,{tooltip:{trigger:'axis',valueFormatter:v=>v+suffix},grid:{left:160,right:20,top:20,bottom:30},xAxis:{type:'value',splitLine:{lineStyle:{color:COLORS.grid}}},yAxis:{type:'category',data:d.map(r=>r.label)},series:[{type:'bar',data:d.map(r=>r.value),itemStyle:{color}}]});
}
function pie(id, t){
  setChart(id,{color:[COLORS.green,COLORS.red],tooltip:{trigger:'item'},legend:{bottom:0},series:[{type:'pie',radius:['48%','70%'],data:[{name:'Issued / Granted',value:t.issued},{name:'Refused',value:t.refused}]}]});
}
function topCountry(key){return state.countryRows.slice().sort((a,b)=>b[key]-a[key]).slice(0,15).map(r=>({label:r.label,value:r[key]}));}

function renderCountryTable(){
  $('countryTable').innerHTML = `<table><thead><tr><th>Nationality</th><th>Applications</th><th>Decisions</th><th>Issued</th><th>Refused</th><th>Grant Rate</th><th>Refusal Rate</th><th>Application Change</th><th>Grant Change</th><th>Refusal Rate Change</th><th>Movement</th></tr></thead><tbody>${state.countryRows.map(r=>`<tr><td>${esc(r.label)}</td><td>${fmt(r.applications)}</td><td>${fmt(r.decisions)}</td><td>${fmt(r.issued)}</td><td>${fmt(r.refused)}</td><td>${pct(r.grantRate)}</td><td>${pct(r.refusalRate)}</td><td>${pc(r.appChange)}</td><td>${pc(r.grantChange)}</td><td>${pp(r.refusalChange)}</td><td><span class="${r.movementClass}">${esc(r.movement)}</span></td></tr>`).join('')}</tbody></table>`;
}

function renderCompare(){
  if(!state.countryRows.length) return;
  const countries = uniq([...document.querySelectorAll('.compare-country')].map(i=>i.value.trim()).filter(v=>v && state.countries.includes(v))).slice(0,5);
  const metric = $('compareMetric').value;
  const rows = countries.map(c => state.countryRows.find(r=>r.label===c)).filter(Boolean);
  const data = rows.map(r => ({label:r.label, value:metric.includes('Rate')?rd(r[metric]*100):r[metric]}));
  setChart('chartCompare', {...optionBase(), xAxis:{type:'category',data:data.map(r=>r.label)}, yAxis:{type:'value',axisLabel:metric.includes('Rate')?{formatter:'{value}%'}:{}}, series:[{type:'bar',data:data.map(r=>r.value),itemStyle:{color:metric==='refusalRate'?COLORS.red:metric==='grantRate'?COLORS.green:COLORS.blue}}]});
  $('compareTable').innerHTML = `<table><thead><tr><th>Country</th><th>${esc(metric)}</th><th>Applications</th><th>Decisions</th><th>Grant Rate</th><th>Refusal Rate</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${metric.includes('Rate')?pct(r[metric]):fmt(r[metric])}</td><td>${fmt(r.applications)}</td><td>${fmt(r.decisions)}</td><td>${pct(r.grantRate)}</td><td>${pct(r.refusalRate)}</td></tr>`).join('')}</tbody></table>`;
}

function exportCsv(){
  const rows = [['Nationality','Applications','Decisions','Issued','Refused','Grant Rate','Refusal Rate','Application Change','Grant Change','Refusal Rate Change','Movement']].concat(state.countryRows.map(r=>[r.label,r.applications,r.decisions,r.issued,r.refused,pct(r.grantRate),pct(r.refusalRate),pc(r.appChange),pc(r.grantChange),pp(r.refusalChange),r.movement]));
  const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ukvi-country-summary.csv'; a.click(); URL.revokeObjectURL(url);
}
