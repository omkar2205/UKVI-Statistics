function buildView(applications, outcomes, filters) {
  const appSummary = summariseApplications(applications);
  const outSummary = summariseOutcomes(outcomes);
  const countryRows = buildCountryRows(applications, outcomes, filters);
  return {
    filters, applications, outcomes,
    summary: Object.assign({}, appSummary, outSummary),
    appSummary, outSummary,
    yearly: yearlyCombined(applications, outcomes),
    quarterlyApplications: quarterlyApplications(applications),
    yearlyApplications: yearlyApplications(applications),
    yearlyOutcomes: yearlyOutcomes(outcomes),
    quarterlyOutcomes: quarterlyOutcomes(outcomes),
    countries: countryRows,
    highestRefusal: countryRows.filter(r => r.decisions >= 30).sort((a,b) => b.refusalRate - a.refusalRate).slice(0, 15),
    lowestRefusal: countryRows.filter(r => r.decisions >= 30).sort((a,b) => a.refusalRate - b.refusalRate).slice(0, 15),
    topApplications: groupApplications(applications, 'n').sort((a,b) => b.applications - a.applications).slice(0, 15),
    snapshot: latestSnapshot(applications, outcomes),
    movement: countryRows.filter(r => r.score !== null && r.score !== undefined).sort((a,b) => b.score - a.score).slice(0, 15)
  };
}

function summariseApplications(rows) {
  const applications = sum(rows, 'a');
  const yearCount = new Set(rows.map(r => r.y)).size;
  const countryCount = new Set(rows.map(r => r.n)).size;
  const topYear = groupApplications(rows, 'y').sort((a,b) => b.applications - a.applications)[0];
  const topCountry = groupApplications(rows, 'n').sort((a,b) => b.applications - a.applications)[0];
  return { applications, averageApplications: yearCount ? applications / yearCount : 0, countryCount, topYear, topCountry };
}
function summariseOutcomes(rows) {
  const issued = rows.reduce((total, row) => total + row.i, 0);
  const refused = rows.reduce((total, row) => total + row.r, 0);
  const decisions = issued + refused;
  return { decisions, issued, refused, grantRate: rate(issued, decisions), refusalRate: rate(refused, decisions) };
}
function buildCountryRows(applications, outcomes, filters) {
  const names = Array.from(new Set(applications.map(r => r.n).concat(outcomes.map(r => r.n)))).sort((a,b) => a.localeCompare(b));
  return names.map(name => withMovement(Object.assign(
    { label: name },
    summariseApplications(applications.filter(r => r.n === name)),
    summariseOutcomes(outcomes.filter(r => r.n === name))
  ), name, filters)).sort((a,b) => b.applications - a.applications);
}
function movementContext(country, filters) {
  const rows = allApplications.concat(allOutcomes).filter(row => {
    if (country && row.n !== country) return false;
    if (row.y < filters.yearFrom || row.y > filters.yearTo) return false;
    if (filters.quarter !== 'All' && row.q !== filters.quarter) return false;
    return true;
  });
  const availableYears = Array.from(new Set(rows.map(r => r.y))).sort((a,b) => a-b);
  if (!availableYears.length) return null;
  const currentYear = availableYears[availableYears.length - 1];
  const previousYear = currentYear - 1;
  const quarters = filters.quarter === 'All'
    ? Array.from(new Set(rows.filter(r => r.y === currentYear).map(r => r.q))).sort(quarterSort)
    : [filters.quarter];
  return { currentYear, previousYear, quarters };
}
function withMovement(row, country, filters) {
  const ctx = movementContext(country, filters);
  if (!ctx) return Object.assign(row, { appChangeRate: null, grantChangeRate: null, refusalRateChange: null, score: null, category: 'Insufficient previous data' });
  const ca = allApplications.filter(r => r.n === country && r.y === ctx.currentYear && ctx.quarters.includes(r.q));
  const pa = allApplications.filter(r => r.n === country && r.y === ctx.previousYear && ctx.quarters.includes(r.q));
  const co = allOutcomes.filter(r => r.n === country && r.y === ctx.currentYear && ctx.quarters.includes(r.q));
  const po = allOutcomes.filter(r => r.n === country && r.y === ctx.previousYear && ctx.quarters.includes(r.q));
  const cas = summariseApplications(ca), pas = summariseApplications(pa), cos = summariseOutcomes(co), pos = summariseOutcomes(po);
  const appChangeRate = changeRate(cas.applications, pas.applications);
  const grantChangeRate = changeRate(cos.issued, pos.issued);
  const refusalRateChange = cos.refusalRate - pos.refusalRate;
  const category = movementCategory(appChangeRate, grantChangeRate, refusalRateChange, pas, pos);
  return Object.assign(row, {
    currentPeriod: `${ctx.currentYear} ${ctx.quarters.join(', ')}`,
    previousPeriod: `${ctx.previousYear} ${ctx.quarters.join(', ')}`,
    currentApplications: cas.applications,
    previousApplications: pas.applications,
    currentIssued: cos.issued,
    previousIssued: pos.issued,
    currentRefusalRate: cos.refusalRate,
    previousRefusalRate: pos.refusalRate,
    appChangeRate,
    grantChangeRate,
    refusalRateChange,
    score: movementScore(appChangeRate, grantChangeRate, refusalRateChange, cos, pos),
    category
  });
}
function movementScore(appChangeRate, grantChangeRate, refusalRateChange, currentOut, previousOut) {
  if (!previousOut.decisions && appChangeRate === null) return null;
  let score = 50;
  if (appChangeRate !== null) { if (appChangeRate >= 0.05) score += 10; if (appChangeRate <= -0.05) score -= 5; }
  if (grantChangeRate !== null) { if (grantChangeRate >= 0.05) score += 15; if (grantChangeRate <= -0.05) score -= 10; }
  if (refusalRateChange <= -0.005) score += 25;
  if (refusalRateChange >= 0.005) score -= 25;
  if (currentOut.grantRate >= previousOut.grantRate) score += 5;
  if (currentOut.refusalRate > previousOut.refusalRate) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}
function movementCategory(appChangeRate, grantChangeRate, refusalRateChange, prevApp, prevOut) {
  if (!prevApp.applications && !prevOut.decisions) return 'Insufficient previous data';
  const appTrend = trend(appChangeRate, 0.05);
  const grantTrend = trend(grantChangeRate, 0.05);
  const refusalTrend = refusalRateChange <= -0.005 ? 'improved' : refusalRateChange >= 0.005 ? 'worsened' : 'stable';
  if (appTrend === 'up' && grantTrend === 'up' && refusalTrend === 'improved') return 'Positive Growth';
  if (appTrend === 'up' && refusalTrend === 'improved') return 'Higher Volume, Better Outcomes';
  if (appTrend === 'up' && refusalTrend === 'worsened') return 'Volume Growth with Risk';
  if (appTrend === 'down' && refusalTrend === 'improved') return 'Lower Volume, Better Outcomes';
  if (appTrend === 'down' && refusalTrend === 'worsened') return 'Declining Performance';
  if (appTrend === 'stable' && refusalTrend === 'improved') return 'Outcome Improvement';
  return 'Stable / Mixed Movement';
}

function yearlyCombined(applications, outcomes) {
  return periods(applications, outcomes, true).map(year => Object.assign({ year }, summariseApplications(applications.filter(r => r.y === year)), summariseOutcomes(outcomes.filter(r => r.y === year))));
}
function yearlyApplications(applications) { return periods(applications, [], true).map(year => ({ year, applications: sum(applications.filter(r => r.y === year), 'a') })); }
function quarterlyApplications(applications) { return periods(applications, []).map(p => ({ label: `${p.y} ${p.q}`, applications: sum(applications.filter(r => r.y === p.y && r.q === p.q), 'a') })); }
function yearlyOutcomes(outcomes) { return periods([], outcomes, true).map(year => Object.assign({ year }, summariseOutcomes(outcomes.filter(r => r.y === year)))); }
function quarterlyOutcomes(outcomes) { return periods([], outcomes).map(p => Object.assign({ label: `${p.y} ${p.q}` }, summariseOutcomes(outcomes.filter(r => r.y === p.y && r.q === p.q)))); }
function latestSnapshot(applications, outcomes) {
  const ps = periods(applications, outcomes);
  if (!ps.length) return null;
  const current = ps[ps.length - 1];
  const previous = { y: current.y - 1, q: current.q };
  return {
    currentLabel: `${current.y} ${current.q}`,
    previousLabel: `${previous.y} ${previous.q}`,
    current: Object.assign({}, summariseApplications(applications.filter(r => r.y === current.y && r.q === current.q)), summariseOutcomes(outcomes.filter(r => r.y === current.y && r.q === current.q))),
    previous: Object.assign({}, summariseApplications(applications.filter(r => r.y === previous.y && r.q === previous.q)), summariseOutcomes(outcomes.filter(r => r.y === previous.y && r.q === previous.q)))
  };
}
function periods(applications, outcomes, yearOnly = false) {
  const map = {};
  applications.concat(outcomes).forEach(row => {
    const key = yearOnly ? row.y : `${row.y}|${row.q}`;
    map[key] = yearOnly ? row.y : { y: row.y, q: row.q };
  });
  return Object.values(map).sort((a,b) => yearOnly ? a-b : a.y-b.y || quarterSort(a.q,b.q));
}
function groupApplications(rows, key) {
  const map = {};
  rows.forEach(row => {
    const label = row[key];
    if (!map[label]) map[label] = { label, applications: 0 };
    map[label].applications += row.a;
  });
  return Object.values(map);
}

function renderDashboard() {
  const s = view.summary;
  document.getElementById('heroRefusal').textContent = percent(s.refusalRate);
  document.getElementById('heroPeriod').textContent = view.filters.quarter === 'All' ? `${view.filters.yearFrom} to ${view.filters.yearTo}` : `${view.filters.yearFrom} to ${view.filters.yearTo} ${view.filters.quarter}`;
  document.getElementById('summaryInsight').textContent = `Applications: ${formatNumber(s.applications)}. Decisions considered: ${formatNumber(s.decisions)}. Grant rate ${percent(s.grantRate)} and refusal rate ${percent(s.refusalRate)}. Use applications vs outcomes directionally because these are not matched applicant-level records.`;
  renderKpis('summaryKpis', [
    ['Applications', formatNumber(s.applications), 'From Sponsored Applied'],
    ['Decisions', formatNumber(s.decisions), 'Issued + Refused'],
    ['Issued / Granted', formatNumber(s.issued), 'Successful outcomes'],
    ['Refused', formatNumber(s.refused), 'Refused outcomes'],
    ['Grant Rate', percent(s.grantRate), 'Issued ÷ decisions'],
    ['Refusal Rate', percent(s.refusalRate), 'Refused ÷ decisions']
  ]);
  renderKpis('applicationKpis', [
    ['Applications', formatNumber(view.appSummary.applications), 'Total selected volume'],
    ['Average / Year', formatNumber(Math.round(view.appSummary.averageApplications || 0)), 'Selected years'],
    ['Countries', formatNumber(view.appSummary.countryCount || 0), 'Selected data'],
    ['Highest Year', view.appSummary.topYear ? view.appSummary.topYear.label : '-', 'Highest volume'],
    ['Highest Country', view.appSummary.topCountry ? view.appSummary.topCountry.label : '-', 'Highest volume']
  ]);
  renderKpis('outcomeKpis', [
    ['Decisions', formatNumber(view.outSummary.decisions), 'Issued + Refused'],
    ['Issued / Granted', formatNumber(view.outSummary.issued), 'Successful outcomes'],
    ['Refused', formatNumber(view.outSummary.refused), 'Refused outcomes'],
    ['Grant Rate', percent(view.outSummary.grantRate), 'Issued ÷ decisions'],
    ['Refusal Rate', percent(view.outSummary.refusalRate), 'Refused ÷ decisions']
  ]);
  renderMovementCards();
  renderCountryProfile();
  renderCharts();
  document.getElementById('countryTable').innerHTML = renderTable(view.countries);
  const ctx = movementContext(null, view.filters);
  document.getElementById('movementNote').textContent = ctx ? `Movement compares ${ctx.currentYear} ${ctx.quarters.join(', ')} with ${ctx.previousYear} ${ctx.quarters.join(', ')}. This is directional and not a matched applicant-level conversion calculation.` : 'Applications and outcomes should be compared directionally.';
  renderCompare();
  resizeVisibleCharts();
}
function renderKpis(id, rows) {
  document.getElementById(id).innerHTML = rows.map(row => `<div class="kpi"><div class="kpi-label">${escapeHtml(row[0])}</div><div class="kpi-value">${escapeHtml(row[1])}</div><div class="kpi-sub">${escapeHtml(row[2] || '')}</div></div>`).join('');
}
