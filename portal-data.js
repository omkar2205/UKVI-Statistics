const FILE='./UKVI%20Data%202020-2026%20Q2.xlsx',MIN=30;
const CFG={
  overall:{label:'Overall Study Visa',sub:'All study visa subtypes, including main applicants and dependants.',app:['Applied'],out:['Outcomes']},
  sponsored:{label:'Sponsored Study Only',sub:'Sponsored study / student visa applications and outcomes for main applicants only.',app:['Sponsored Applied'],out:['Sponsored Outcomes','Sponsored study']}
};
const C={a:'#2f80c0',d:'#64748b',i:'#15836f',r:'#c0392b',w:'#a16207',g:'#e5eaf0'};
let wb,scope='sponsored',A=[],O=[],Y=[],N=[],SEL=[],V={},CH={};

function showError(m){const box=document.getElementById('errorBox');if(box){box.style.display='block';box.textContent='Error: '+m;}else{console.error(m)}}
function clearError(){const box=document.getElementById('errorBox');if(box){box.style.display='none';box.textContent=''}}

document.addEventListener('click',e=>{if(window.countryBox&&!window.countryBox.contains(e.target))closeCountryMenu()});
addEventListener('resize',()=>Object.values(CH).forEach(c=>c&&c.resize()));

async function load(){
  try{
    clearError();
    const r=await fetch(FILE+'?v=20260827-datafix2',{cache:'no-store'});
    if(!r.ok)throw Error('Could not load workbook. HTTP '+r.status);
    wb=XLSX.read(await r.arrayBuffer(),{type:'array'});
    loadScope(scope);
    applyFilters();
    set('guideLoaded',new Date().toLocaleString('en-GB'));
  }catch(e){showError(e.message||e)}
  finally{const l=document.getElementById('loader');if(l)l.style.display='none'}
}

function loadScope(s){
  scope=s;clearError();
  const c=CFG[s];
  A=readApplications(c.app);
  O=readOutcomes(c.out);
  Y=u(A.map(x=>x.y).concat(O.map(x=>x.y))).sort((a,b)=>a-b);
  N=u(A.map(x=>x.n).concat(O.map(x=>x.n))).sort((a,b)=>a.localeCompare(b));

  set('reportTitle',c.label);set('scopeLabel',c.label);set('topScope',c.label);set('reportSubtitle',c.sub);
  document.querySelectorAll('.scope-btn').forEach(b=>b.classList.toggle('active',b.dataset.scope==s));

  if(!Y.length){
    const sheets=wb&&wb.SheetNames?wb.SheetNames.join(', '):'No workbook loaded';
    showError('No readable data was found for '+c.label+'. Workbook sheets found: '+sheets+'. Expected application sheets: '+c.app.join(' / ')+'. Expected outcome sheets: '+c.out.join(' / ')+'.');
    Y=[2020,2021,2022,2023,2024,2025,2026];
  }

  fill(yearFrom,Y,Y[0]);
  fill(yearTo,Y,Y.at(-1));
  fill(compareYear,Y,Y.at(-1));
  countryOptions.innerHTML=N.map(n=>`<option value="${e(n)}"></option>`).join('');
  renderCountryMenu();
  set('guideLatest',lastPeriod()||'-');
  renderCompareSlots();
}
function setScope(s){SEL=[];loadScope(s);applyFilters()}

function getSheet(name){
  if(!wb)return null;
  const exact=wb.Sheets[name];
  if(exact)return exact;
  const wanted=norm(name);
  const found=wb.SheetNames.find(x=>norm(x)===wanted);
  return found?wb.Sheets[found]:null;
}
function rowsOf(sheet){return XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:false})}
function norm(v){return cl(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function getByAliases(obj,aliases){for(const a of aliases){if(obj[a]!==undefined)return obj[a]}return ''}
function buildObjects(sheet,requiredGroups){
  const rows=rowsOf(sheet);
  let best={idx:-1,score:-1,map:null};
  const max=Math.min(rows.length,40);
  for(let i=0;i<max;i++){
    const headers=rows[i].map(norm);
    const map={};headers.forEach((h,idx)=>{if(h&&!map[h])map[h]=idx});
    let score=0;
    requiredGroups.forEach(group=>{if(group.some(a=>map[norm(a)]!==undefined))score++});
    if(score>best.score)best={idx:i,score,map};
  }
  if(best.idx<0||best.score<Math.min(2,requiredGroups.length))return [];
  const header=rows[best.idx].map(norm);
  return rows.slice(best.idx+1).map(r=>{
    const o={};header.forEach((h,i)=>{if(h)o[h]=r[i]});return o;
  });
}
function value(row,aliases){return getByAliases(row,aliases.map(norm))}

const ALIAS={
  year:['year','calendar year','year group'],
  quarter:['quarter','qtr','period','year quarter','year and quarter'],
  nationality:['nationality','country','country nationality','country of nationality','applicant nationality','nationality country'],
  applications:['applications','application','application count','applications count','number of applications','visa applications','main applications'],
  outcome:['case outcome','case outcomes','outcome','outcomes','decision','decision outcome','case decision'],
  decisions:['decisions','decision count','number of decisions','outcome count','outcomes count','visa outcomes']
};

function readApplications(sheetNames){
  const m={};
  sheetNames.forEach(name=>{
    const s=getSheet(name);if(!s)return;
    const rows=buildObjects(s,[ALIAS.year,ALIAS.quarter,ALIAS.nationality,ALIAS.applications]);
    rows.forEach(r=>{
      const y=yr(value(r,ALIAS.year),value(r,ALIAS.quarter));
      const q=qt(value(r,ALIAS.quarter));
      const n=cl(value(r,ALIAS.nationality));
      const a=num(value(r,ALIAS.applications));
      if(y&&q&&n&&a){const k=`${y}|${q}|${n}`;m[k]=m[k]||{y,q,n,a:0};m[k].a+=a}
    });
  });
  return Object.values(m);
}
function readOutcomes(sheetNames){
  const m={};
  sheetNames.forEach(name=>{
    const s=getSheet(name);if(!s)return;
    const rows=buildObjects(s,[ALIAS.year,ALIAS.quarter,ALIAS.nationality,ALIAS.outcome,ALIAS.decisions]);
    rows.forEach(r=>{
      const o=oc(value(r,ALIAS.outcome));
      const y=yr(value(r,ALIAS.year),value(r,ALIAS.quarter));
      const q=qt(value(r,ALIAS.quarter));
      const n=cl(value(r,ALIAS.nationality));
      const d=num(value(r,ALIAS.decisions));
      if(o&&y&&q&&n&&d){const k=`${y}|${q}|${n}|${o}`;m[k]=m[k]||{y,q,n,o,d:0};m[k].d+=d}
    });
  });
  return Object.values(m);
}

function fill(el,vals,val){if(!el)return;el.innerHTML='';vals.forEach(v=>el.add(new Option(v,v)));el.value=val}
function f(){return{yf:+yearFrom.value||Y[0],yt:+yearTo.value||Y.at(-1),q:quarter.value||'All',ns:SEL}}
function applyFilters(){
  const x=f();
  const a=A.filter(r=>r.y>=x.yf&&r.y<=x.yt&&(x.q==='All'||r.q===x.q)&&(!x.ns.length||x.ns.includes(r.n)));
  const o=O.filter(r=>r.y>=x.yf&&r.y<=x.yt&&(x.q==='All'||r.q===x.q)&&(!x.ns.length||x.ns.includes(r.n)));
  V=build(a,o,x);
  activeFilterText.textContent='Current filters: '+[`${x.yf} to ${x.yt}`,x.q==='All'?'':x.q,!SEL.length?'All countries':SEL.length===1?SEL[0]:SEL.length+' countries selected'].filter(Boolean).join(' | ');
  render();closeCountryMenu();
}
function resetFilters(){SEL=[];yearFrom.value=Y[0];yearTo.value=Y.at(-1);quarter.value='All';countrySearch.value='';renderCountryMenu();applyFilters()}
function build(a,o,x){
  const app=apps(a),out=outs(o),nat=nats(a,o,x);
  const yrRows=u(a.map(r=>r.y).concat(o.map(r=>r.y))).sort((a,b)=>a-b).map(y=>({label:String(y),...apps(a.filter(r=>r.y===y)),...outs(o.filter(r=>r.y===y))}));
  const qRows=periods(a,o).map(p=>({label:p.label,...apps(a.filter(r=>r.y===p.y&&r.q===p.q)),...outs(o.filter(r=>r.y===p.y&&r.q===p.q))}));
  return{a,o,x,app,out,s:{...app,...out},nat,yrRows,qRows,snap:snap(a,o),hi:nat.filter(r=>r.decisions>=MIN).sort((a,b)=>b.refusalRate-a.refusalRate).slice(0,15),lo:nat.filter(r=>r.decisions>=MIN).sort((a,b)=>a.refusalRate-b.refusalRate).slice(0,15)};
}
function apps(a){const applications=sum(a,'a'),yrs=new Set(a.map(r=>r.y)),cs=new Set(a.map(r=>r.n));return{applications,avg:yrs.size?applications/yrs.size:0,countryCount:cs.size,highestYear:top(a,'y','a'),highestCountry:top(a,'n','a')}}
function outs(o){let issued=0,refused=0;o.forEach(r=>r.o==='issued'?issued+=r.d:refused+=r.d);const decisions=issued+refused;return{decisions,issued,refused,grantRate:decisions?issued/decisions:0,refusalRate:decisions?refused/decisions:0}}
function nats(a,o,x){return u(a.map(r=>r.n).concat(o.map(r=>r.n))).sort().map(n=>{const row={label:n,...apps(a.filter(r=>r.n===n)),...outs(o.filter(r=>r.n===n))};return mv(row,n,x)}).sort((a,b)=>b.applications-a.applications)}
function mv(row,n,x){
  const relevant=A.concat(O).filter(r=>r.n===n&&r.y>=x.yf&&r.y<=x.yt);
  const years=u(relevant.map(r=>r.y));
  if(!years.length)return{...row,ac:null,gc:null,rrc:null,mtext:'– Insufficient Data',mclass:'text-neutral'};
  const cy=Math.max(...years),py=cy-1;
  const qs=x.q==='All'?u(relevant.filter(r=>r.y===cy).map(r=>r.q)):[x.q];
  const ca=apps(A.filter(r=>r.n===n&&r.y===cy&&qs.includes(r.q))),pa=apps(A.filter(r=>r.n===n&&r.y===py&&qs.includes(r.q)));
  const co=outs(O.filter(r=>r.n===n&&r.y===cy&&qs.includes(r.q))),po=outs(O.filter(r=>r.n===n&&r.y===py&&qs.includes(r.q)));
  if(!pa.applications&&!po.decisions)return{...row,ac:null,gc:null,rrc:null,mtext:'– Insufficient Data',mclass:'text-neutral'};
  const ac=chg(ca.applications,pa.applications),gc=chg(co.issued,po.issued),rrc=co.refusalRate-po.refusalRate,l=lab(ac,gc,rrc);
  return{...row,ac,gc,rrc,mtext:l[0],mclass:l[1],score:Math.max(0,Math.min(100,Math.round(50+(ac>.05?10:ac<-.05?-5:0)+(gc>.05?15:gc<-.05?-10:0)+(rrc<-.005?25:rrc>.005?-25:0))))};
}
function lab(a,g,r){let up=a>.05,down=a<-.05,gd=g>.05,gb=g<-.05,better=r<-.005,worse=r>.005;if(up&&gd&&better)return['↗ Positive Growth','text-good'];if(up&&better)return['↗ Higher Volume, Better Outcome','text-good'];if(down&&better)return['↘ Lower Volume, Better Outcome','text-good'];if(up&&worse)return['⚠ Higher Volume, Higher Risk','text-warn'];if((down&&worse)||(gb&&worse))return['↓ Declining','text-risk'];return['→ Stable / Mixed','text-warn']}
function periods(a,o){const m={};a.concat(o).forEach(r=>m[`${r.y}|${r.q}`]={y:r.y,q:r.q,label:`${r.y} ${r.q}`});return Object.values(m).sort((a,b)=>a.y-b.y||Number(a.q[1])-Number(b.q[1]))}
function snap(a,o){const p=periods(a,o);if(!p.length)return null;const c=p.at(-1),pr={y:c.y-1,q:c.q,label:`${c.y-1} ${c.q}`};return{cur:c,prev:pr,c:outs(o.filter(r=>r.y===c.y&&r.q===c.q)),p:outs(o.filter(r=>r.y===pr.y&&r.q===pr.q))}}
function lastPeriod(){const p=periods(A,O);return p.length?p.at(-1).label:null}
