const FILE = './UKVI%20Data%202020-2026%20Q2.xlsx';
const MIN_BASE = 30;
const colours = {
  apps: '#4f95d1', decisions: '#7d93ad', issued: '#2a9d8f', refused: '#dc6b62', navy: '#246080', amber: '#c98b2c', grid: '#e9f1f8'
};
let applied = [], outcomes = [], years = [], countries = [], selectedCountries = [], view = null, compareSlots = 2;
const chartRegistry = {};

window.addEventListener('resize', debounce(resizeCharts, 180));
document.addEventListener('click', e => {
  const multi = document.getElementById('countryMulti');
  if (multi && !multi.contains(e.target)) closeCountryMenu();
});
loadData();

async function loadData() {
  try {
    const response = await fetch(FILE, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Could not load the Excel workbook from GitHub.');
    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const appSheet = workbook.Sheets['Sponsored Applied'];
    const outSheet = workbook.Sheets['Sponsored study'];
    if (!appSheet || !outSheet) throw new Error('Workbook must contain Sponsored Applied and Sponsored study sheets.');
    prepareData(
      XLSX.utils.sheet_to_json(appSheet, { defval: '' }),
      XLSX.utils.sheet_to_json(outSheet, { defval: '' })
    );
    initialiseControls();
    applyFilters();
    document.getElementById('loadedAt').textContent = new Date().toLocaleString('en-GB');
  } catch (error) {
    showError(error);
  } finally {
    document.getElementById('loader').style.display = 'none';
  }
}

function prepareData(applicationRows, outcomeRows) {
  const appMap = new Map();
  const outcomeMap = new Map();
  const countrySet = new Set();
  const yearSet = new Set();

  applicationRows.forEach(row => {
    const year = extractYear(row.Year, row.Quarter);
    const quarter = extractQuarter(row.Quarter);
    const country = clean(row.Nationality);
    const applications = number(row.Applications);
    if (!year || !quarter || !country || !applications) return;
    countrySet.add(country); yearSet.add(year);
    const key = `${year}|${quarter}|${country}`;
    appMap.set(key, (appMap.get(key) || 0) + applications);
  });

  outcomeRows.forEach(row => {
    const outcome = clean(row['Case outcome']);
    if (!isGrant(outcome) && !isRefusal(outcome)) return;
    const year = extractYear(row.Year, row.Quarter);
    const quarter = extractQuarter(row.Quarter);
    const country = clean(row.Nationality);
    const decisions = number(row.Decisions);
    if (!year || !quarter || !country || !decisions) return;
    countrySet.add(country); yearSet.add(year);
    const key = `${year}|${quarter}|${country}`;
    const current = outcomeMap.get(key) || { issued: 0, refused: 0 };
    if (isGrant(outcome)) current.issued += decisions;
    if (isRefusal(outcome)) current.refused += decisions;
    outcomeMap.set(key, current);
  });

  applied = [...appMap.entries()].map(([key, applications]) => {
    const [year, quarter, country] = key.split('|');
    return { year: +year, quarter, country, applications };
  });
  outcomes = [];
  outcomeMap.forEach((value, key) => {
    const [year, quarter, country] = key.split('|');
    if (value.issued) outcomes.push({ year: +year, quarter, country, outcome: 'Issued / Granted', decisions: value.issued });
    if (value.refused) outcomes.push({ year: +year, quarter, country, outcome: 'Refused', decisions: value.refused });
  });
  years = [...yearSet].sort((a, b) => a - b);
  countries = [...countrySet].sort((a, b) => a.localeCompare(b));
  const latest = last(periods(applied, outcomes));
  document.getElementById('latestPeriod').textContent = latest ? `${latest.year} ${latest.quarter}` : '-';
}

function initialiseControls() {
  fillSelect('yearFrom', years, years[0]);
  fillSelect('yearTo', years, last(years));
  document.getElementById('yearFrom').onchange = () => { if (+yearFrom.value > +yearTo.value) yearTo.value = yearFrom.value; };
  document.getElementById('yearTo').onchange = () => { if (+yearTo.value < +yearFrom.value) yearFrom.value = yearTo.value; };
  fillSelect('compareYear', years, last(years));
  renderCountryMenu();
  renderCountryOptions();
  renderCompareSlots();
  toggleCompareMode();
}

function fillSelect(id, values, selected) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  values.forEach(value => el.add(new Option(value, value)));
  el.value = selected;
}

function collectFilters() {
  return {
    yearFrom: +document.getElementById('yearFrom').value,
    yearTo: +document.getElementById('yearTo').value,
    quarter: document.getElementById('quarter').value,
    countries: selectedCountries
  };
}

function filterApplications(filters) {
  return applied.filter(row => row.year >= filters.yearFrom && row.year <= filters.yearTo && (filters.quarter === 'All' || row.quarter === filters.quarter) && (!filters.countries.length || filters.countries.includes(row.country)));
}
function filterOutcomes(filters) {
  return outcomes.filter(row => row.year >= filters.yearFrom && row.year <= filters.yearTo && (filters.quarter === 'All' || row.quarter === filters.quarter) && (!filters.countries.length || filters.countries.includes(row.country)));
}

function applyFilters() {
  const filters = collectFilters();
  view = buildView(filterApplications(filters), filterOutcomes(filters), filters);
  document.getElementById('activeFilterText').textContent = 'Current filters: ' + [
    `${filters.yearFrom} to ${filters.yearTo}`,
    filters.quarter === 'All' ? null : filters.quarter,
    !filters.countries.length ? 'All countries' : filters.countries.length === 1 ? filters.countries[0] : `${filters.countries.length} countries selected`
  ].filter(Boolean).join(' | ');
  closeCountryMenu();
  renderPortal();
}

function buildView(appRows, outcomeRows, filters) {
  const applicationSummary = summariseApplications(appRows);
  const outcomeSummary = summariseOutcomes(outcomeRows);
  const countryRows = buildCountryRows(appRows, outcomeRows, filters);
  return {
    filters,
    appRows,
    outcomeRows,
    summary: { ...applicationSummary, ...outcomeSummary },
    applications: applicationSummary,
    outcomes: outcomeSummary,
    yearly: yearlyRows(appRows, outcomeRows),
    quarterlyApplications: quarterlyApplications(appRows),
    yearlyOutcomes: yearlyOutcomes(outcomeRows),
    quarterlyOutcomes: quarterlyOutcomes(outcomeRows),
    countryRows,
    highestRefusal: countryRows.filter(r => r.decisions >= MIN_BASE).sort((a, b) => b.refusalRate - a.refusalRate).slice(0, 15),
    lowestRefusal: countryRows.filter(r => r.decisions >= MIN_BASE).sort((a, b) => a.refusalRate - b.refusalRate).slice(0, 15),
    snapshot: latestSnapshot(appRows, outcomeRows),
    movement: countryRows.filter(r => r.score !== null).sort((a, b) => b.score - a.score).slice(0, 15)
  };
}

function summariseApplications(rows) {
  const applications = sum(rows, 'applications');
  const yearCount = new Set(rows.map(r => r.year)).size;
  const countryCount = new Set(rows.map(r => r.country)).size;
  const topYear = groupSum(rows, 'year', 'applications').sort((a, b) => b.value - a.value)[0];
  const topCountry = groupSum(rows, 'country', 'applications').sort((a, b) => b.value - a.value)[0];
  return { applications, averageApplications: yearCount ? applications / yearCount : 0, countryCount, topYear, topCountry };
}
function summariseOutcomes(rows) {
  let issued = 0, refused = 0;
  rows.forEach(row => row.outcome === 'Issued / Granted' ? issued += row.decisions : refused += row.decisions);
  const decisions = issued + refused;
  return { decisions, issued, refused, grantRate: safeRate(issued, decisions), refusalRate: safeRate(refused, decisions) };
}
function buildCountryRows(appRows, outcomeRows, filters) {
  const names = [...new Set(appRows.map(r => r.country).concat(outcomeRows.map(r => r.country)))].sort();
  return names.map(country => enrichMovement({
    country,
    ...summariseApplications(appRows.filter(r => r.country === country)),
    ...summariseOutcomes(outcomeRows.filter(r => r.country === country))
  }, country, filters)).sort((a, b) => b.applications - a.applications);
}

function movementContext(country, filters) {
  const rows = applied.concat(outcomes).filter(row => (!country || row.country === country) && row.year >= filters.yearFrom && row.year <= filters.yearTo && (filters.quarter === 'All' || row.quarter === filters.quarter));
  const selectedYears = [...new Set(rows.map(r => r.year))].sort((a, b) => a - b);
  if (!selectedYears.length) return null;
  const currentYear = last(selectedYears);
  const previousYear = currentYear - 1;
  const quarters = filters.quarter === 'All'
    ? [...new Set(rows.filter(r => r.year === currentYear).map(r => r.quarter))].sort(sortQuarter)
    : [filters.quarter];
  return { currentYear, previousYear, quarters };
}
function enrichMovement(row, country, filters) {
  const context = movementContext(country, filters);
  if (!context) return { ...row, applicationChangeRate: null, grantChangeRate: null, refusalRateChange: null, score: null, category: 'Insufficient previous data' };
  const currentApps = applied.filter(r => r.country === country && r.year === context.currentYear && context.quarters.includes(r.quarter));
  const previousApps = applied.filter(r => r.country === country && r.year === context.previousYear && context.quarters.includes(r.quarter));
  const currentOut = outcomes.filter(r => r.country === country && r.year === context.currentYear && context.quarters.includes(r.quarter));
  const previousOut = outcomes.filter(r => r.country === country && r.year === context.previousYear && context.quarters.includes(r.quarter));
  const ca = summariseApplications(currentApps), pa = summariseApplications(previousApps), co = summariseOutcomes(currentOut), po = summariseOutcomes(previousOut);
  const applicationChangeRate = safeChange(ca.applications, pa.applications);
  const grantChangeRate = safeChange(co.issued, po.issued);
  const refusalRateChange = co.refusalRate - po.refusalRate;
  const category = movementCategory(applicationChangeRate, grantChangeRate, refusalRateChange, pa, po);
  const score = movementScore(applicationChangeRate, grantChangeRate, refusalRateChange, co, po);
  return { ...row, applicationChangeRate, grantChangeRate, refusalRateChange, score, category, currentPeriod: `${context.currentYear} ${context.quarters.join(', ')}`, previousPeriod: `${context.previousYear} ${context.quarters.join(', ')}` };
}

function yearlyRows(appRows, outcomeRows) {
  return periods(appRows, outcomeRows, true).map(year => ({ year, ...summariseApplications(appRows.filter(r => r.year === year)), ...summariseOutcomes(outcomeRows.filter(r => r.year === year)) }));
}
function quarterlyApplications(appRows) {
  return periods(appRows, [], false).map(p => ({ label: `${p.year} ${p.quarter}`, applications: sum(appRows.filter(r => r.year === p.year && r.quarter === p.quarter), 'applications') }));
}
function yearlyOutcomes(outcomeRows) {
  return periods([], outcomeRows, true).map(year => ({ year, ...summariseOutcomes(outcomeRows.filter(r => r.year === year)) }));
}
function quarterlyOutcomes(outcomeRows) {
  return periods([], outcomeRows, false).map(p => ({ label: `${p.year} ${p.quarter}`, ...summariseOutcomes(outcomeRows.filter(r => r.year === p.year && r.quarter === p.quarter)) }));
}
function latestSnapshot(appRows, outcomeRows) {
  const ps = periods(appRows, outcomeRows, false);
  if (!ps.length) return null;
  const current = last(ps);
  const previous = { year: current.year - 1, quarter: current.quarter };
  return {
    previousLabel: `${previous.year} ${previous.quarter}`,
    currentLabel: `${current.year} ${current.quarter}`,
    previous: { ...summariseApplications(appRows.filter(r => r.year === previous.year && r.quarter === previous.quarter)), ...summariseOutcomes(outcomeRows.filter(r => r.year === previous.year && r.quarter === previous.quarter)) },
    current: { ...summariseApplications(appRows.filter(r => r.year === current.year && r.quarter === current.quarter)), ...summariseOutcomes(outcomeRows.filter(r => r.year === current.year && r.quarter === current.quarter)) }
  };
}
function periods(appRows, outcomeRows, yearOnly = false) {
  const map = {};
  appRows.concat(outcomeRows).forEach(row => { map[yearOnly ? row.year : `${row.year}|${row.quarter}`] = yearOnly ? row.year : { year: row.year, quarter: row.quarter }; });
  return Object.values(map).sort((a, b) => yearOnly ? a - b : a.year - b.year || sortQuarter(a.quarter, b.quarter));
}

function renderPortal() {
  const s = view.summary;
  document.getElementById('selectedRefusalRate').textContent = percent(s.refusalRate);
  document.getElementById('selectedScope').textContent = view.filters.countries.length === 1 ? view.filters.countries[0] : 'Current filter selection';
  document.getElementById('releasePeriod').textContent = document.getElementById('latestPeriod').textContent;
  document.getElementById('latestComparison').textContent = view.snapshot ? `${view.snapshot.currentLabel} vs ${view.snapshot.previousLabel}` : '-';
  renderBriefing();
  renderKpis();
  renderMovementCards();
  renderCountryProfile();
  renderTables();
  renderCharts();
  renderCompare();
  resizeCharts();
}

function renderBriefing() {
  const s = view.summary, snap = view.snapshot;
  document.getElementById('briefTitle').textContent = `The latest view covers ${formatNumber(s.applications)} applications and ${formatNumber(s.decisions)} decisions considered.`;
  document.getElementById('briefIntro').textContent = `Across the selected filters, the grant rate is ${percent(s.grantRate)} and the refusal rate is ${percent(s.refusalRate)}. The charts below explain whether this is driven by volume, outcomes, or country mix.`;
  const items = [];
  items.push(['01', 'Volume', `${formatNumber(s.applications)} applications are in scope for the current selection.`]);
  items.push(['02', 'Outcomes', `${formatNumber(s.issued)} issued/granted decisions and ${formatNumber(s.refused)} refusals are included.`]);
  if (snap) {
    const appMove = snap.current.applications - snap.previous.applications;
    const rateMove = snap.current.refusalRate - snap.previous.refusalRate;
    items.push(['03', 'Latest quarter', `${snap.currentLabel} is compared with ${snap.previousLabel}: applications ${signedNumber(appMove)}, refusal rate ${signedPp(rateMove)}.`]);
  }
  document.getElementById('briefBullets').innerHTML = items.map(item => `<div class="brief-item"><span>${item[0]}</span><div><b>${escapeHtml(item[1])}</b><small>${escapeHtml(item[2])}</small></div></div>`).join('');
}
function renderKpis() {
  const s = view.summary;
  const kpis = [
    ['Applications', formatNumber(s.applications), 'Sponsored Applied'],
    ['Decisions', formatNumber(s.decisions), 'Issued + Refused'],
    ['Issued / Granted', formatNumber(s.issued), 'Successful outcomes'],
    ['Refused', formatNumber(s.refused), 'Refused outcomes'],
    ['Grant Rate', percent(s.grantRate), 'Issued ÷ decisions'],
    ['Refusal Rate', percent(s.refusalRate), 'Refused ÷ decisions']
  ];
  document.getElementById('kpiGrid').innerHTML = kpis.map(k => `<div class="kpi"><div class="kpi-label">${k[0]}</div><div class="kpi-value">${k[1]}</div><div class="kpi-sub">${k[2]}</div></div>`).join('');
}
function renderMovementCards() {
  const snap = view.snapshot;
  if (!snap) { document.getElementById('movementCards').innerHTML = ''; return; }
  const appChange = safeChange(snap.current.applications, snap.previous.applications);
  const issuedChange = safeChange(snap.current.issued, snap.previous.issued);
  const refusalRateChange = snap.current.refusalRate - snap.previous.refusalRate;
  const cards = [
    ['Applications change', signedPercent(appChange), appChange >= 0 ? 'move-neutral' : 'move-risk', `${snap.currentLabel} vs ${snap.previousLabel}`],
    ['Issued / granted change', signedPercent(issuedChange), issuedChange >= 0 ? 'move-good' : 'move-risk', `${formatNumber(snap.current.issued)} current issued/granted`],
    ['Refusal rate movement', signedPp(refusalRateChange), refusalRateChange <= 0 ? 'move-good' : 'move-risk', 'Percentage-point change']
  ];
  document.getElementById('movementCards').innerHTML = cards.map(c => `<div class="move-card"><div class="move-label">${c[0]}</div><div class="move-value ${c[2]}">${c[1]}</div><div class="kpi-sub">${c[3]}</div></div>`).join('');
}
function renderCountryProfile() {
  const box = document.getElementById('countryProfile');
  if (view.filters.countries.length !== 1) { box.innerHTML = ''; return; }
  const country = view.filters.countries[0];
  const row = view.countryRows.find(r => r.country === country);
  if (!row) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="profile-layout"><div><div class="section-label" style="color:var(--blue)">Country profile</div><h2 class="profile-title">${escapeHtml(country)}</h2><p class="profile-copy">For the selected period, ${escapeHtml(country)} has ${formatNumber(row.applications)} applications, ${formatNumber(row.decisions)} decisions considered and a refusal rate of ${percent(row.refusalRate)}. Movement category: <b>${escapeHtml(row.category)}</b>.</p></div><div class="profile-stats"><div class="profile-stat"><span>Applications</span><b>${formatNumber(row.applications)}</b></div><div class="profile-stat"><span>Issued / Granted</span><b>${formatNumber(row.issued)}</b></div><div class="profile-stat"><span>Refusal Rate</span><b>${percent(row.refusalRate)}</b></div></div></div>`;
}
function renderTables() {
  document.getElementById('countryTable').innerHTML = countryTable(view.countryRows);
}

function chart(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!chartRegistry[id]) chartRegistry[id] = echarts.init(el, null, { renderer: 'canvas' });
  return chartRegistry[id];
}
function setChart(id, option) {
  const c = chart(id);
  if (!c) return;
  c.setOption(option, true);
}
function baseOption() {
  return {
    color: [colours.apps, colours.decisions, colours.issued, colours.refused, colours.navy, colours.amber],
    tooltip: { trigger: 'axis', backgroundColor: '#142033', borderWidth: 0, textStyle: { color: '#fff' } },
    legend: { bottom: 0, textStyle: { color: '#415069' } },
    grid: { left: 58, right: 32, top: 28, bottom: 64, containLabel: true },
    xAxis: { type: 'category', axisLine: { lineStyle: { color: '#cbd8e6' } }, axisLabel: { color: '#667085' }, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: colours.grid } }, axisLabel: { color: '#667085' } }
  };
}
function renderCharts() {
  annualVolumeChart();
  refusalTrendChart();
  latestSnapshotChart();
  quarterApplicationsChart();
  outcomeYearChart();
  rateTrendChart();
  outcomeQuarterChart();
  refusalRankChart('chartHighRefusal', view.highestRefusal);
  refusalRankChart('chartLowRefusal', view.lowestRefusal);
  outcomeMixChart();
  scatterChart();
  movementChart();
}
function annualVolumeChart() {
  const data = view.yearly;
  setChart('chartAnnualVolume', { ...baseOption(), xAxis: { ...baseOption().xAxis, data: data.map(r => r.year) }, yAxis: { ...baseOption().yAxis, axisLabel: { formatter: compact, color: '#667085' } }, series: [
    { name: 'Applications', type: 'bar', data: data.map(r => r.applications), itemStyle: { color: colours.apps, borderRadius: [6, 6, 0, 0] } },
    { name: 'Decisions', type: 'bar', data: data.map(r => r.decisions), itemStyle: { color: colours.decisions, borderRadius: [6, 6, 0, 0] } }
  ]});
}
function refusalTrendChart() {
  const data = view.yearly;
  setChart('chartRefusalTrend', { ...baseOption(), xAxis: { ...baseOption().xAxis, data: data.map(r => r.year) }, yAxis: { ...baseOption().yAxis, axisLabel: { formatter: v => v + '%', color: '#667085' } }, series: [{ name: 'Refusal Rate', type: 'line', smooth: true, symbolSize: 8, data: data.map(r => +(r.refusalRate * 100).toFixed(2)), itemStyle: { color: colours.refused }, lineStyle: { width: 4, color: colours.refused }, areaStyle: { color: 'rgba(220,107,98,.12)' } }] });
}
function latestSnapshotChart() {
  const snap = view.snapshot;
  if (!snap) return emptyChart('chartLatestSnapshot');
  setChart('chartLatestSnapshot', { ...baseOption(), xAxis: { ...baseOption().xAxis, data: [snap.previousLabel, snap.currentLabel] }, yAxis: [{ ...baseOption().yAxis, name: 'Applications', axisLabel: { formatter: compact, color: '#667085' } }, { type: 'value', name: 'Refusal Rate', axisLabel: { formatter: v => v + '%', color: '#667085' }, splitLine: { show: false } }], series: [
    { name: 'Applications', type: 'bar', data: [snap.previous.applications, snap.current.applications], itemStyle: { color: colours.apps, borderRadius: [7, 7, 0, 0] } },
    { name: 'Refusal Rate', type: 'line', yAxisIndex: 1, data: [+(snap.previous.refusalRate * 100).toFixed(2), +(snap.current.refusalRate * 100).toFixed(2)], smooth: true, symbolSize: 8, itemStyle: { color: colours.refused }, lineStyle: { width: 4, color: colours.refused } }
  ]});
}
function quarterApplicationsChart() {
  const data = view.quarterlyApplications;
  setChart('chartQuarterApplications', { ...baseOption(), xAxis: { ...baseOption().xAxis, data: data.map(r => r.label), axisLabel: { rotate: 35, color: '#667085' } }, yAxis: { ...baseOption().yAxis, axisLabel: { formatter: compact, color: '#667085' } }, series: [{ name: 'Applications', type: 'line', smooth: true, symbolSize: 6, data: data.map(r => r.applications), itemStyle: { color: colours.apps }, lineStyle: { width: 4, color: colours.apps }, areaStyle: { color: 'rgba(79,149,209,.14)' } }] });
}
function outcomeYearChart() {
  const data = view.yearlyOutcomes;
  setChart('chartOutcomeYear', { ...baseOption(), xAxis: { ...baseOption().xAxis, data: data.map(r => r.year) }, yAxis: { ...baseOption().yAxis, axisLabel: { formatter: compact, color: '#667085' } }, series: [
    { name: 'Issued / Granted', type: 'bar', stack: 'outcomes', data: data.map(r => r.issued), itemStyle: { color: colours.issued, borderRadius: [6, 6, 0, 0] } },
    { name: 'Refused', type: 'bar', stack: 'outcomes', data: data.map(r => r.refused), itemStyle: { color: colours.refused, borderRadius: [6, 6, 0, 0] } }
  ]});
}
function rateTrendChart() {
  const data = view.yearlyOutcomes;
  setChart('chartRateTrend', { ...baseOption(), xAxis: { ...baseOption().xAxis, data: data.map(r => r.year) }, yAxis: { ...baseOption().yAxis, axisLabel: { formatter: v => v + '%', color: '#667085' } }, series: [
    { name: 'Grant Rate', type: 'line', smooth: true, data: data.map(r => +(r.grantRate * 100).toFixed(2)), itemStyle: { color: colours.issued }, lineStyle: { width: 4, color: colours.issued } },
    { name: 'Refusal Rate', type: 'line', smooth: true, data: data.map(r => +(r.refusalRate * 100).toFixed(2)), itemStyle: { color: colours.refused }, lineStyle: { width: 4, color: colours.refused } }
  ]});
}
function outcomeQuarterChart() {
  const data = view.quarterlyOutcomes;
  setChart('chartOutcomeQuarter', { ...baseOption(), xAxis: { ...baseOption().xAxis, data: data.map(r => r.label), axisLabel: { rotate: 35, color: '#667085' } }, yAxis: { ...baseOption().yAxis, axisLabel: { formatter: compact, color: '#667085' } }, series: [
    { name: 'Issued / Granted', type: 'line', smooth: true, symbolSize: 5, data: data.map(r => r.issued), itemStyle: { color: colours.issued }, lineStyle: { width: 3, color: colours.issued } },
    { name: 'Refused', type: 'line', smooth: true, symbolSize: 5, data: data.map(r => r.refused), itemStyle: { color: colours.refused }, lineStyle: { width: 3, color: colours.refused } }
  ]});
}
function refusalRankChart(id, rows) {
  if (!rows.length) return emptyChart(id);
  const data = [...rows].reverse();
  setChart(id, { ...baseOption(), grid: { left: 150, right: 28, top: 20, bottom: 45, containLabel: true }, xAxis: { type: 'value', axisLabel: { formatter: v => v + '%', color: '#667085' }, splitLine: { lineStyle: { color: colours.grid } } }, yAxis: { type: 'category', data: data.map(r => r.country), axisLabel: { color: '#415069' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd8e6' } } }, series: [{ name: 'Refusal Rate', type: 'bar', data: data.map(r => +(r.refusalRate * 100).toFixed(2)), itemStyle: { color: id.includes('Low') ? colours.teal : colours.refused, borderRadius: [0, 7, 7, 0] } }] });
}
function outcomeMixChart() {
  const s = view.summary;
  setChart('chartOutcomeMix', { tooltip: { trigger: 'item', backgroundColor: '#142033', borderWidth: 0, textStyle: { color: '#fff' } }, legend: { bottom: 0 }, series: [{ name: 'Outcome Mix', type: 'pie', radius: ['52%', '76%'], center: ['50%', '45%'], data: [{ name: 'Issued / Granted', value: s.issued, itemStyle: { color: colours.issued } }, { name: 'Refused', value: s.refused, itemStyle: { color: colours.refused } }], label: { formatter: '{b}\n{d}%' } }] });
}
function scatterChart() {
  const rows = view.countryRows.filter(r => r.applications > 0 && r.decisions >= MIN_BASE);
  setChart('chartScatter', { ...baseOption(), tooltip: { trigger: 'item', backgroundColor: '#142033', borderWidth: 0, textStyle: { color: '#fff' }, formatter: p => `${p.data[3]}<br>Applications: ${formatNumber(p.data[0])}<br>Refusal Rate: ${p.data[1].toFixed(1)}%<br>Decisions: ${formatNumber(p.data[2])}` }, xAxis: { type: 'value', name: 'Applications', axisLabel: { formatter: compact, color: '#667085' }, splitLine: { lineStyle: { color: colours.grid } } }, yAxis: { type: 'value', name: 'Refusal Rate', axisLabel: { formatter: v => v + '%', color: '#667085' }, splitLine: { lineStyle: { color: colours.grid } } }, series: [{ name: 'Countries', type: 'scatter', data: rows.map(r => [r.applications, +(r.refusalRate * 100).toFixed(2), r.decisions, r.country]), symbolSize: value => Math.max(9, Math.min(46, Math.sqrt(value[2] || 0) / 8)), itemStyle: { color: 'rgba(220,107,98,.72)', borderColor: '#fff', borderWidth: 1 } }] });
}
function movementChart() {
  const data = [...view.movement].reverse();
  setChart('chartMovement', { ...baseOption(), grid: { left: 150, right: 28, top: 20, bottom: 45, containLabel: true }, xAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: colours.grid } } }, yAxis: { type: 'category', data: data.map(r => r.country), axisLabel: { color: '#415069' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd8e6' } } }, series: [{ name: 'Movement Score', type: 'bar', data: data.map(r => r.score), itemStyle: { color: colours.navy, borderRadius: [0, 7, 7, 0] } }] });
}
function emptyChart(id) { setChart(id, { title: { text: 'No data available', left: 'center', top: 'middle', textStyle: { color: '#667085', fontSize: 14, fontWeight: 600 } }, xAxis: { show: false }, yAxis: { show: false }, series: [] }); }

function renderCompareSlots() {
  const defaults = selectedCountries.length ? selectedCountries.slice(0, Math.max(2, selectedCountries.length)) : ['India', 'Pakistan'];
  const html = Array.from({ length: compareSlots }).map((_, i) => `<div class="compare-slot"><input list="countryOptions" id="compareCountry${i}" placeholder="Country ${i + 1}" value="${escapeHtml(defaults[i] || '')}">${i > 1 ? `<button class="icon-button" onclick="removeCompareSlot(${i})">×</button>` : ''}</div>`).join('');
  document.getElementById('compareSlots').innerHTML = html;
}
function renderCountryOptions() { document.getElementById('countryOptions').innerHTML = countries.map(c => `<option value="${escapeHtml(c)}"></option>`).join(''); }
function addCompareSlot() { if (compareSlots < 5) { compareSlots++; renderCompareSlots(); } }
function removeCompareSlot(i) { compareSlots--; renderCompareSlots(); }
function resetCompare() { compareSlots = 2; renderCompareSlots(); document.getElementById('compareMetric').value = 'refusalRate'; document.getElementById('compareMode').value = 'trend'; toggleCompareMode(); renderCompare(); }
function toggleCompareMode() {
  const mode = document.getElementById('compareMode').value;
  document.querySelectorAll('.compare-period').forEach(e => e.style.display = mode === 'period' ? 'block' : 'none');
  document.querySelectorAll('.compare-trend').forEach(e => e.style.display = mode === 'trend' ? 'block' : 'none');
}
function renderCompare() {
  const mode = document.getElementById('compareMode').value;
  const metric = document.getElementById('compareMetric').value;
  const selected = Array.from({ length: compareSlots }).map((_, i) => clean(document.getElementById(`compareCountry${i}`)?.value)).filter(Boolean).filter(c => countries.includes(c));
  if (!selected.length) { emptyChart('chartCompare'); document.getElementById('compareTable').innerHTML = '<div class="empty-table">Select at least one country.</div>'; return; }
  const rows = mode === 'period' ? comparePeriodRows(selected, metric) : compareTrendRows(selected, metric);
  mode === 'period' ? compareBar(rows, metric) : compareLine(rows, selected, metric);
  document.getElementById('compareTable').innerHTML = compareTable(rows, metric, mode);
}
function comparePeriodRows(selected, metric) {
  const year = +document.getElementById('compareYear').value;
  const quarter = document.getElementById('compareQuarter').value;
  return selected.map(country => {
    const appRows = applied.filter(r => r.country === country && r.year === year && (quarter === 'All' || r.quarter === quarter));
    const outRows = outcomes.filter(r => r.country === country && r.year === year && (quarter === 'All' || r.quarter === quarter));
    return { country, period: quarter === 'All' ? String(year) : `${year} ${quarter}`, ...summariseApplications(appRows), ...summariseOutcomes(outRows) };
  });
}
function compareTrendRows(selected, metric) {
  const trendPeriod = document.getElementById('compareTrendPeriod').value;
  const quarter = document.getElementById('compareTrendQuarter').value;
  let trendYears = years.slice();
  if (trendPeriod !== 'all') trendYears = trendYears.slice(-Number(trendPeriod));
  const rows = [];
  selected.forEach(country => trendYears.forEach(year => {
    const appRows = applied.filter(r => r.country === country && r.year === year && (quarter === 'All' || r.quarter === quarter));
    const outRows = outcomes.filter(r => r.country === country && r.year === year && (quarter === 'All' || r.quarter === quarter));
    rows.push({ country, period: String(year), ...summariseApplications(appRows), ...summariseOutcomes(outRows) });
  }));
  return rows;
}
function compareBar(rows, metric) {
  const rateMetric = metric.includes('Rate');
  setChart('chartCompare', { ...baseOption(), xAxis: { ...baseOption().xAxis, data: rows.map(r => r.country) }, yAxis: { ...baseOption().yAxis, axisLabel: { formatter: rateMetric ? v => v + '%' : compact, color: '#667085' } }, series: [{ name: metricLabel(metric), type: 'bar', data: rows.map(r => metricValue(r, metric)), itemStyle: { color: rateMetric ? colours.refused : colours.apps, borderRadius: [7, 7, 0, 0] } }] });
}
function compareLine(rows, selected, metric) {
  const periodsList = [...new Set(rows.map(r => r.period))];
  const rateMetric = metric.includes('Rate');
  setChart('chartCompare', { ...baseOption(), xAxis: { ...baseOption().xAxis, data: periodsList }, yAxis: { ...baseOption().yAxis, axisLabel: { formatter: rateMetric ? v => v + '%' : compact, color: '#667085' } }, series: selected.map(country => ({ name: country, type: 'line', smooth: true, symbolSize: 7, data: periodsList.map(period => { const row = rows.find(r => r.country === country && r.period === period); return row ? metricValue(row, metric) : null; }), lineStyle: { width: 3 } })) });
}
function metricValue(row, metric) { return metric.includes('Rate') ? +(row[metric] * 100).toFixed(2) : row[metric]; }
function metricLabel(metric) { return ({ applications: 'Applications', decisions: 'Decisions considered', issued: 'Issued / Granted', refused: 'Refused', grantRate: 'Grant Rate', refusalRate: 'Refusal Rate' })[metric] || metric; }

function countryTable(rows) {
  return `<table><thead><tr><th>Country</th><th>Applications</th><th>Decisions</th><th>Issued / Granted</th><th>Refused</th><th>Grant Rate</th><th>Refusal Rate</th><th>Application Change</th><th>Grant Change</th><th>Refusal Rate Change</th><th>Score</th><th>Category</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.country)}</td><td>${formatNumber(r.applications)}</td><td>${formatNumber(r.decisions)}</td><td>${formatNumber(r.issued)}</td><td>${formatNumber(r.refused)}</td><td>${percent(r.grantRate)}</td><td>${percent(r.refusalRate)}</td><td>${signedPercent(r.applicationChangeRate)}</td><td>${signedPercent(r.grantChangeRate)}</td><td>${signedPp(r.refusalRateChange)}</td><td>${r.score ?? '-'}</td><td>${badge(r.category)}</td></tr>`).join('')}</tbody></table>`;
}
function compareTable(rows, metric, mode) {
  return `<table><thead><tr><th>Country</th><th>Period</th><th>${metricLabel(metric)}</th><th>Applications</th><th>Decisions</th><th>Refusal Rate</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.country)}</td><td>${escapeHtml(r.period)}</td><td>${metric.includes('Rate') ? percent(r[metric]) : formatNumber(r[metric])}</td><td>${formatNumber(r.applications)}</td><td>${formatNumber(r.decisions)}</td><td>${percent(r.refusalRate)}</td></tr>`).join('')}</tbody></table>`;
}
function exportCountryCsv() {
  const header = ['Country','Applications','Decisions','Issued / Granted','Refused','Grant Rate','Refusal Rate','Application Change','Grant Change','Refusal Rate Change','Score','Category'];
  const lines = [header].concat(view.countryRows.map(r => [r.country,r.applications,r.decisions,r.issued,r.refused,percent(r.grantRate),percent(r.refusalRate),signedPercent(r.applicationChangeRate),signedPercent(r.grantChangeRate),signedPp(r.refusalRateChange),r.score ?? '-',r.category]));
  const csv = lines.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ukvi-country-summary.csv'; a.click(); URL.revokeObjectURL(url);
}

function toggleCountryMenu(event) { event.stopPropagation(); document.getElementById('countryMenu').classList.toggle('open'); }
function closeCountryMenu() { document.getElementById('countryMenu').classList.remove('open'); }
function renderCountryMenu() {
  const search = (document.getElementById('countrySearch')?.value || '').toLowerCase();
  const visible = countries.filter(c => c.toLowerCase().includes(search));
  document.getElementById('countryList').innerHTML = visible.map(c => `<label class="country-option"><input type="checkbox" value="${escapeHtml(c)}" ${selectedCountries.includes(c) ? 'checked' : ''} onchange="toggleCountrySelection(this)"><span>${escapeHtml(c)}</span></label>`).join('') || '<div class="kpi-sub">No countries found.</div>';
  updateCountryLabel();
}
function toggleCountrySelection(el) { el.checked ? selectedCountries.push(el.value) : selectedCountries = selectedCountries.filter(c => c !== el.value); selectedCountries = [...new Set(selectedCountries)].sort(); updateCountryLabel(); }
function selectVisibleCountries() { document.querySelectorAll('#countryList input').forEach(el => { if (!selectedCountries.includes(el.value)) selectedCountries.push(el.value); el.checked = true; }); selectedCountries = [...new Set(selectedCountries)].sort(); updateCountryLabel(); }
function clearCountries() { selectedCountries = []; renderCountryMenu(); }
function updateCountryLabel() { document.getElementById('countryLabel').textContent = !selectedCountries.length ? 'All countries' : selectedCountries.length === 1 ? `${selectedCountries[0]} selected` : `${selectedCountries.length} countries selected`; }
function resetFilters() { selectedCountries = []; yearFrom.value = years[0]; yearTo.value = last(years); quarter.value = 'All'; countrySearch.value = ''; renderCountryMenu(); applyFilters(); }

function showSection(section) {
  document.querySelectorAll('.section').forEach(el => el.classList.toggle('active', el.dataset.section === section));
  document.querySelectorAll('.nav-pill').forEach(el => el.classList.toggle('active', el.dataset.section === section));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(resizeCharts, 180);
}
function resizeCharts() { Object.values(chartRegistry).forEach(c => c.resize()); }

function movementCategory(appChange, grantChange, refusalMove, prevApps, prevOut) {
  if (!prevApps.applications && !prevOut.decisions) return 'Insufficient previous data';
  const a = trend(appChange, .05), g = trend(grantChange, .05), r = refusalMove <= -.005 ? 'improved' : refusalMove >= .005 ? 'worsened' : 'stable';
  if (a === 'up' && g === 'up' && r === 'improved') return 'Positive Growth';
  if (a === 'up' && r === 'improved') return 'Higher Volume, Better Outcomes';
  if (a === 'up' && r === 'worsened') return 'Volume Growth with Risk';
  if (a === 'down' && r === 'improved') return 'Lower Volume, Better Outcomes';
  if (a === 'down' && r === 'worsened') return 'Declining Performance';
  if (a === 'stable' && r === 'improved') return 'Outcome Improvement';
  return 'Stable / Mixed Movement';
}
function movementScore(appChange, grantChange, refusalMove, currentOut, previousOut) {
  if (!previousOut.decisions && appChange === null) return null;
  let score = 50;
  if (appChange !== null) { if (appChange >= .05) score += 10; if (appChange <= -.05) score -= 5; }
  if (grantChange !== null) { if (grantChange >= .05) score += 15; if (grantChange <= -.05) score -= 10; }
  if (refusalMove <= -.005) score += 25;
  if (refusalMove >= .005) score -= 25;
  if (currentOut.grantRate >= previousOut.grantRate) score += 5;
  if (currentOut.refusalRate > previousOut.refusalRate) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}
function badge(text) { const lower = String(text || '').toLowerCase(); const cls = lower.includes('positive') || lower.includes('better') || lower.includes('improvement') ? 'good' : lower.includes('risk') || lower.includes('declining') ? 'risk' : 'warn'; return `<span class="badge ${cls}">${escapeHtml(text || '-')}</span>`; }
function trend(value, threshold) { if (value === null || isNaN(value)) return 'unknown'; if (value >= threshold) return 'up'; if (value <= -threshold) return 'down'; return 'stable'; }
function groupSum(rows, key, valueKey) { const map = {}; rows.forEach(row => { const label = row[key]; if (!map[label]) map[label] = { label, value: 0 }; map[label].value += +row[valueKey] || 0; }); return Object.values(map); }
function sum(rows, key) { return rows.reduce((total, row) => total + (+row[key] || 0), 0); }
function safeRate(n, d) { return d ? n / d : 0; }
function safeChange(current, previous) { return previous ? (current - previous) / previous : null; }
function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function number(value) { const n = +String(value ?? '').replace(/,/g, '').trim(); return isNaN(n) ? 0 : n; }
function extractQuarter(value) { const match = clean(value).toUpperCase().match(/\bQ([1-4])\b/); return match ? `Q${match[1]}` : clean(value); }
function extractYear(yearValue, quarterValue) { const direct = number(yearValue); if (direct > 1900) return direct; const match = clean(quarterValue).match(/\b(20\d{2})\b/); return match ? +match[1] : direct; }
function isGrant(value) { const v = clean(value).toLowerCase(); return v.includes('issued') || v.includes('grant'); }
function isRefusal(value) { const v = clean(value).toLowerCase(); return v.includes('refused') || v.includes('refusal') || v.includes('rejected'); }
function sortQuarter(a, b) { return +a.slice(1) - +b.slice(1); }
function last(array) { return array[array.length - 1]; }
function formatNumber(value) { return (+value || 0).toLocaleString('en-GB'); }
function compact(value) { const n = +value || 0; if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'm'; if (Math.abs(n) >= 1000) return (n / 1000).toFixed(0) + 'k'; return String(n); }
function percent(value) { return ((+value || 0) * 100).toFixed(1) + '%'; }
function signedPercent(value) { if (value === null || isNaN(value)) return '-'; const n = value * 100; return (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
function signedPp(value) { if (value === null || isNaN(value)) return '-'; const n = value * 100; return (n > 0 ? '+' : '') + n.toFixed(1) + ' pp'; }
function signedNumber(value) { return (value > 0 ? '+' : '') + formatNumber(value); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
function debounce(fn, wait) { let t; return () => { clearTimeout(t); t = setTimeout(fn, wait); }; }
function showError(error) { const box = document.getElementById('errorBox'); box.style.display = 'block'; box.textContent = 'Error: ' + (error.message || error); }
