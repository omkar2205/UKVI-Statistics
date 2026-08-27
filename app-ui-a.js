function renderMovementCards() {
  const snap = view.snapshot;
  if (!snap) { document.getElementById('movementCards').innerHTML = ''; return; }
  const appChange = changeRate(snap.current.applications, snap.previous.applications);
  const decisionsChange = changeRate(snap.current.decisions, snap.previous.decisions);
  const refusalRateChange = snap.current.refusalRate - snap.previous.refusalRate;
  const grantChange = changeRate(snap.current.issued, snap.previous.issued);
  document.getElementById('movementCards').innerHTML = [
    ['Latest comparison', `${snap.currentLabel} vs ${snap.previousLabel}`, 'move-neutral'],
    ['Applications change', signedPercent(appChange), classForSigned(appChange, true)],
    ['Grant change', signedPercent(grantChange), classForSigned(grantChange, true)],
    ['Refusal rate change', signedPercentagePoints(refusalRateChange), classForSigned(refusalRateChange, false)]
  ].map(card => `<div class="move-card"><div class="move-label">${card[0]}</div><div class="move-value ${card[2]}">${card[1]}</div></div>`).join('');
}
function renderCountryProfile() {
  const box = document.getElementById('countryProfile');
  if (selectedCountries.length !== 1) { box.innerHTML = ''; return; }
  const country = selectedCountries[0];
  const row = view.countries.find(r => r.label === country);
  if (!row) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="profile-grid"><div><h2 class="profile-title">${escapeHtml(country)} profile</h2><div class="profile-copy">Applications: <b>${formatNumber(row.applications)}</b>. Decisions considered: <b>${formatNumber(row.decisions)}</b>. Grant rate: <b>${percent(row.grantRate)}</b>. Refusal rate: <b>${percent(row.refusalRate)}</b>.</div></div><div><h3>Movement view</h3><div class="profile-copy">${escapeHtml(row.currentPeriod || 'Current period')} vs ${escapeHtml(row.previousPeriod || 'previous period')}: <b>${escapeHtml(row.category || '-')}</b>. Movement score: <b>${row.score === null || row.score === undefined ? '-' : row.score}</b>.</div></div></div>`;
}

function renderCharts() {
  plotApplicationsDecisions('chartApplicationsDecisions', view.yearly);
  plotRateTrend('chartRefusalTrend', view.yearlyOutcomes, true);
  plotSnapshot('chartLatestSnapshot', view.snapshot);
  plotRateBar('chartHighestRefusal', view.highestRefusal);
  plotOutcomeMix('chartOutcomeMix');
  plotLine('chartApplicationsQuarter', view.quarterlyApplications, 'label', 'applications', COLORS.apps, 'Applications');
  plotBar('chartApplicationsYear', view.yearlyApplications, 'year', 'applications', COLORS.apps, 'Applications');
  plotHorizontalBar('chartTopApplications', view.topApplications, 'applications', COLORS.apps, 'Applications');
  plotOutcomeBars('chartOutcomeYear', view.yearlyOutcomes, 'year');
  plotRateTrend('chartRateTrend', view.yearlyOutcomes, false);
  plotOutcomeLines('chartOutcomeQuarter', view.quarterlyOutcomes);
  plotRateBar('chartCountryHigh', view.highestRefusal);
  plotRateBar('chartCountryLow', view.lowestRefusal);
  plotApplicationsDecisions('chartAnalysisYear', view.yearly);
  plotScatter('chartScatter', view.countries.filter(r => r.applications > 0 && r.decisions >= 30));
  plotMovement('chartMovement', view.movement);
}
function emptyChart(id, text = 'No data for selected filters') {
  Plotly.newPlot(id, [], Object.assign({}, BASE_LAYOUT, { annotations: [{ text, x: 0.5, y: 0.5, xref: 'paper', yref: 'paper', showarrow: false, font: { size: 14, color: COLORS.muted } }], xaxis: { visible: false }, yaxis: { visible: false } }), PLOT_CONFIG);
}
function plotApplicationsDecisions(id, rows) {
  if (!rows.length) return emptyChart(id);
  Plotly.newPlot(id, [
    { x: rows.map(r => r.year), y: rows.map(r => r.applications), name: 'Applications', type: 'bar', marker: { color: COLORS.apps }, hovertemplate: 'Applications: %{y:,.0f}<extra></extra>' },
    { x: rows.map(r => r.year), y: rows.map(r => r.decisions), name: 'Decisions', type: 'bar', marker: { color: COLORS.decisions }, hovertemplate: 'Decisions: %{y:,.0f}<extra></extra>' }
  ], Object.assign({}, BASE_LAYOUT, { barmode: 'group', yaxis: { title: 'Volume', tickformat: ',.0f', gridcolor: COLORS.grid } }), PLOT_CONFIG);
}
function plotBar(id, rows, xKey, yKey, color, yTitle) {
  if (!rows.length) return emptyChart(id);
  Plotly.newPlot(id, [{ x: rows.map(r => r[xKey]), y: rows.map(r => r[yKey]), type: 'bar', marker: { color }, hovertemplate: '%{y:,.0f}<extra></extra>' }], Object.assign({}, BASE_LAYOUT, { showlegend: false, yaxis: { title: yTitle, tickformat: ',.0f', gridcolor: COLORS.grid } }), PLOT_CONFIG);
}
function plotLine(id, rows, xKey, yKey, color, yTitle) {
  if (!rows.length) return emptyChart(id);
  Plotly.newPlot(id, [{ x: rows.map(r => r[xKey]), y: rows.map(r => r[yKey]), type: 'scatter', mode: 'lines+markers', line: { color, width: 3, shape: 'spline' }, marker: { color, size: 6 }, hovertemplate: '%{x}<br>%{y:,.0f}<extra></extra>' }], Object.assign({}, BASE_LAYOUT, { xaxis: { tickangle: -35, automargin: true, gridcolor: COLORS.grid }, yaxis: { title: yTitle, tickformat: ',.0f', gridcolor: COLORS.grid } }), PLOT_CONFIG);
}
function plotHorizontalBar(id, rows, valueKey, color, title) {
  if (!rows.length) return emptyChart(id);
  const data = rows.slice().reverse();
  Plotly.newPlot(id, [{ x: data.map(r => r[valueKey]), y: data.map(r => r.label), type: 'bar', orientation: 'h', marker: { color }, hovertemplate: '%{y}<br>%{x:,.0f}<extra></extra>' }], Object.assign({}, BASE_LAYOUT, { margin: { l: 170, r: 25, t: 15, b: 45 }, xaxis: { title, tickformat: ',.0f', gridcolor: COLORS.grid }, yaxis: { automargin: true } }), PLOT_CONFIG);
}
function plotOutcomeBars(id, rows, xKey) {
  if (!rows.length) return emptyChart(id);
  Plotly.newPlot(id, [
    { x: rows.map(r => r[xKey]), y: rows.map(r => r.issued), name: 'Issued / Granted', type: 'bar', marker: { color: COLORS.issued } },
    { x: rows.map(r => r[xKey]), y: rows.map(r => r.refused), name: 'Refused', type: 'bar', marker: { color: COLORS.refused } }
  ], Object.assign({}, BASE_LAYOUT, { barmode: 'group', yaxis: { title: 'Outcome volume', tickformat: ',.0f', gridcolor: COLORS.grid } }), PLOT_CONFIG);
}
function plotOutcomeLines(id, rows) {
  if (!rows.length) return emptyChart(id);
  Plotly.newPlot(id, [
    { x: rows.map(r => r.label), y: rows.map(r => r.issued), name: 'Issued / Granted', type: 'scatter', mode: 'lines+markers', line: { color: COLORS.issued, width: 3, shape: 'spline' } },
    { x: rows.map(r => r.label), y: rows.map(r => r.refused), name: 'Refused', type: 'scatter', mode: 'lines+markers', line: { color: COLORS.refused, width: 3, shape: 'spline' } }
  ], Object.assign({}, BASE_LAYOUT, { xaxis: { tickangle: -35, automargin: true, gridcolor: COLORS.grid }, yaxis: { title: 'Outcome volume', tickformat: ',.0f', gridcolor: COLORS.grid } }), PLOT_CONFIG);
}
function plotRateTrend(id, rows, refusalOnly) {
  if (!rows.length) return emptyChart(id);
  const traces = refusalOnly ? [
    { x: rows.map(r => r.year), y: rows.map(r => r.refusalRate * 100), name: 'Refusal Rate', type: 'scatter', mode: 'lines+markers', line: { color: COLORS.refused, width: 3, shape: 'spline' }, marker: { size: 7 } }
  ] : [
    { x: rows.map(r => r.year), y: rows.map(r => r.grantRate * 100), name: 'Grant Rate', type: 'scatter', mode: 'lines+markers', line: { color: COLORS.issued, width: 3, shape: 'spline' }, marker: { size: 7 } },
    { x: rows.map(r => r.year), y: rows.map(r => r.refusalRate * 100), name: 'Refusal Rate', type: 'scatter', mode: 'lines+markers', line: { color: COLORS.refused, width: 3, shape: 'spline' }, marker: { size: 7 } }
  ];
  Plotly.newPlot(id, traces, Object.assign({}, BASE_LAYOUT, { yaxis: { title: 'Rate %', ticksuffix: '%', rangemode: 'tozero', gridcolor: COLORS.grid } }), PLOT_CONFIG);
}
function plotRateBar(id, rows) {
  if (!rows.length) return emptyChart(id);
  const data = rows.slice().reverse();
  Plotly.newPlot(id, [{ x: data.map(r => r.refusalRate * 100), y: data.map(r => r.label), type: 'bar', orientation: 'h', marker: { color: COLORS.refused }, hovertemplate: '%{y}<br>Refusal Rate: %{x:.1f}%<extra></extra>' }], Object.assign({}, BASE_LAYOUT, { margin: { l: 170, r: 25, t: 15, b: 45 }, xaxis: { title: 'Refusal Rate', ticksuffix: '%', gridcolor: COLORS.grid }, yaxis: { automargin: true } }), PLOT_CONFIG);
}
function plotSnapshot(id, snap) {
  if (!snap) return emptyChart(id);
  Plotly.newPlot(id, [
    { x: [snap.previousLabel, snap.currentLabel], y: [snap.previous.applications, snap.current.applications], name: 'Applications', type: 'bar', marker: { color: COLORS.apps }, yaxis: 'y' },
    { x: [snap.previousLabel, snap.currentLabel], y: [snap.previous.refusalRate * 100, snap.current.refusalRate * 100], name: 'Refusal Rate', type: 'scatter', mode: 'lines+markers', line: { color: COLORS.refused, width: 3 }, marker: { size: 8 }, yaxis: 'y2' }
  ], Object.assign({}, BASE_LAYOUT, { yaxis: { title: 'Applications', tickformat: ',.0f', gridcolor: COLORS.grid }, yaxis2: { title: 'Refusal Rate', overlaying: 'y', side: 'right', ticksuffix: '%', gridcolor: 'rgba(0,0,0,0)' } }), PLOT_CONFIG);
}
function plotOutcomeMix(id) {
  if (!view.summary.decisions) return emptyChart(id);
  Plotly.newPlot(id, [{ labels: ['Issued / Granted', 'Refused'], values: [view.summary.issued, view.summary.refused], type: 'pie', hole: 0.58, marker: { colors: [COLORS.issued, COLORS.refused] }, textinfo: 'label+percent', hovertemplate: '%{label}: %{value:,.0f}<extra></extra>' }], Object.assign({}, BASE_LAYOUT, { margin: { l: 20, r: 20, t: 20, b: 30 }, showlegend: false }), PLOT_CONFIG);
}
function plotScatter(id, rows) {
  if (!rows.length) return emptyChart(id);
  Plotly.newPlot(id, [{
    x: rows.map(r => r.applications),
    y: rows.map(r => r.refusalRate * 100),
    text: rows.map(r => r.label),
    customdata: rows.map(r => [r.decisions, r.grantRate * 100]),
    mode: 'markers', type: 'scatter',
    marker: { size: rows.map(r => Math.max(9, Math.min(42, Math.sqrt(r.decisions || 0) / 12))), color: rows.map(r => r.refusalRate * 100), colorscale: [[0, '#8fd5cc'], [0.55, '#e9c46a'], [1, '#df7f72']], opacity: 0.78, line: { width: 1.4, color: '#fff' }, showscale: true, colorbar: { title: 'Refusal %' } },
    hovertemplate: '%{text}<br>Applications: %{x:,.0f}<br>Refusal Rate: %{y:.1f}%<br>Decisions: %{customdata[0]:,.0f}<br>Grant Rate: %{customdata[1]:.1f}%<extra></extra>'
  }], Object.assign({}, BASE_LAYOUT, { xaxis: { title: 'Applications', tickformat: ',.0f', gridcolor: COLORS.grid }, yaxis: { title: 'Refusal Rate', ticksuffix: '%', gridcolor: COLORS.grid } }), PLOT_CONFIG);
}
function plotMovement(id, rows) {
  if (!rows.length) return emptyChart(id);
  const data = rows.slice(0, 15).reverse();
  Plotly.newPlot(id, [{ x: data.map(r => r.score), y: data.map(r => r.label), text: data.map(r => r.category), type: 'bar', orientation: 'h', marker: { color: data.map(r => r.score >= 70 ? COLORS.issued : r.score < 45 ? COLORS.refused : COLORS.amber) }, hovertemplate: '%{y}<br>Score: %{x}<br>%{text}<extra></extra>' }], Object.assign({}, BASE_LAYOUT, { margin: { l: 170, r: 25, t: 15, b: 45 }, xaxis: { title: 'Movement Score', range: [0, 100], gridcolor: COLORS.grid }, yaxis: { automargin: true } }), PLOT_CONFIG);
}
