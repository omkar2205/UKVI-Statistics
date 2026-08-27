function handleCompareMode() {
  const mode = document.getElementById('compareMode').value;
  document.querySelectorAll('.compare-period').forEach(el => el.style.display = mode === 'period' ? 'block' : 'none');
  document.querySelectorAll('.compare-trend').forEach(el => el.style.display = mode === 'trend' ? 'block' : 'none');
}
function renderCompareSlots(values) {
  const defaults = values && values.length ? values : ['India', 'Pakistan'];
  compareSlotCount = Math.max(2, Math.min(5, defaults.length));
  const html = [];
  for (let i = 0; i < compareSlotCount; i++) html.push(compareSlotHtml(i, defaults[i] || ''));
  document.getElementById('compareSlots').innerHTML = html.join('');
}
function compareSlotHtml(index, value) {
  return `<div class="compare-slot"><input list="countryOptions" class="compare-country" value="${escapeHtml(value)}" placeholder="Country ${index + 1}">${index >= 2 ? '<button class="icon-btn" onclick="removeCompareSlot(this)">×</button>' : ''}</div>`;
}
function addCompareSlot() {
  if (document.querySelectorAll('.compare-country').length >= 5) return;
  document.getElementById('compareSlots').insertAdjacentHTML('beforeend', compareSlotHtml(document.querySelectorAll('.compare-country').length, ''));
}
function removeCompareSlot(button) { button.closest('.compare-slot').remove(); }
function resetCompare() { renderCompareSlots(['India', 'Pakistan'].filter(c => countries.includes(c))); renderCompare(); }
function getCompareCountries() {
  return Array.from(document.querySelectorAll('.compare-country')).map(input => input.value.trim()).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i && countries.includes(v)).slice(0, 5);
}
function renderCompare() {
  if (!view) return;
  const selected = getCompareCountries();
  const metric = document.getElementById('compareMetric').value;
  const mode = document.getElementById('compareMode').value;
  if (!selected.length) { emptyChart('chartCompare', 'Select countries to compare'); document.getElementById('compareTable').innerHTML = ''; return; }
  if (mode === 'period') renderPeriodCompare(selected, metric); else renderTrendCompare(selected, metric);
}
function renderPeriodCompare(selected, metric) {
  const year = Number(document.getElementById('compareYear').value);
  const quarter = document.getElementById('compareQuarter').value;
  const rows = selected.map(country => {
    const a = allApplications.filter(r => r.n === country && r.y === year && (quarter === 'All' || r.q === quarter));
    const o = allOutcomes.filter(r => r.n === country && r.y === year && (quarter === 'All' || r.q === quarter));
    return Object.assign({ label: country }, summariseApplications(a), summariseOutcomes(o));
  });
  const values = rows.map(r => metricValue(r, metric));
  Plotly.newPlot('chartCompare', [{ x: rows.map(r => r.label), y: values, type: 'bar', marker: { color: metric.includes('Rate') ? COLORS.refused : COLORS.navy }, hovertemplate: `%{x}<br>${METRIC_LABELS[metric]}: %{y${metric.includes('Rate') ? ':.1f' : ':,.0f'}}${metric.includes('Rate') ? '%' : ''}<extra></extra>` }], Object.assign({}, BASE_LAYOUT, { yaxis: { title: METRIC_LABELS[metric], ticksuffix: metric.includes('Rate') ? '%' : '', gridcolor: COLORS.grid } }), PLOT_CONFIG);
  document.getElementById('compareTable').innerHTML = renderSimpleCompareTable(rows, metric);
}
function renderTrendCompare(selected, metric) {
  const period = document.getElementById('compareTrendPeriod').value;
  const quarter = document.getElementById('compareTrendQuarter').value;
  let useYears = years.slice();
  if (period !== 'all') useYears = useYears.slice(-Number(period));
  const traces = selected.map(country => {
    const rows = useYears.map(year => {
      const a = allApplications.filter(r => r.n === country && r.y === year && (quarter === 'All' || r.q === quarter));
      const o = allOutcomes.filter(r => r.n === country && r.y === year && (quarter === 'All' || r.q === quarter));
      const summary = Object.assign({}, summariseApplications(a), summariseOutcomes(o));
      return { year, value: metricValue(summary, metric) };
    });
    return { x: rows.map(r => r.year), y: rows.map(r => r.value), name: country, type: 'scatter', mode: 'lines+markers', line: { width: 3, shape: 'spline' }, marker: { size: 7 } };
  });
  Plotly.newPlot('chartCompare', traces, Object.assign({}, BASE_LAYOUT, { yaxis: { title: METRIC_LABELS[metric], ticksuffix: metric.includes('Rate') ? '%' : '', gridcolor: COLORS.grid } }), PLOT_CONFIG);
  const tableRows = selected.map(country => {
    const a = allApplications.filter(r => r.n === country && useYears.includes(r.y) && (quarter === 'All' || r.q === quarter));
    const o = allOutcomes.filter(r => r.n === country && useYears.includes(r.y) && (quarter === 'All' || r.q === quarter));
    return Object.assign({ label: country }, summariseApplications(a), summariseOutcomes(o));
  });
  document.getElementById('compareTable').innerHTML = renderSimpleCompareTable(tableRows, metric);
}
function metricValue(row, metric) { return metric.includes('Rate') ? (row[metric] || 0) * 100 : (row[metric] || 0); }
function renderSimpleCompareTable(rows, metric) {
  return `<table><thead><tr><th>Country</th><th>${METRIC_LABELS[metric]}</th><th>Applications</th><th>Decisions</th><th>Grant Rate</th><th>Refusal Rate</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.label)}</td><td>${metric.includes('Rate') ? percent(r[metric]) : formatNumber(r[metric])}</td><td>${formatNumber(r.applications)}</td><td>${formatNumber(r.decisions)}</td><td>${percent(r.grantRate)}</td><td>${percent(r.refusalRate)}</td></tr>`).join('')}</tbody></table>`;
}

function renderTable(rows) {
  return `<table><thead><tr><th>Nationality</th><th>Applications</th><th>Decisions</th><th>Issued</th><th>Refused</th><th>Grant Rate</th><th>Refusal Rate</th><th>Application Change</th><th>Grant Change</th><th>Refusal Rate Change</th><th>Score</th><th>Category</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.label)}</td><td>${formatNumber(r.applications)}</td><td>${formatNumber(r.decisions)}</td><td>${formatNumber(r.issued)}</td><td>${formatNumber(r.refused)}</td><td>${percent(r.grantRate)}</td><td>${percent(r.refusalRate)}</td><td>${signedPercent(r.appChangeRate)}</td><td>${signedPercent(r.grantChangeRate)}</td><td>${signedPercentagePoints(r.refusalRateChange)}</td><td>${r.score === null || r.score === undefined ? '-' : r.score}</td><td>${badge(r.category)}</td></tr>`).join('')}</tbody></table>`;
}
function badge(category) {
  const c = (category || '').toLowerCase();
  const cls = c.includes('positive') || c.includes('better') || c.includes('improvement') ? 'good' : c.includes('risk') || c.includes('declining') ? 'risk' : 'warn';
  return `<span class="badge ${cls}">${escapeHtml(category || '-')}</span>`;
}
function exportCsv() {
  const headers = ['Nationality','Applications','Decisions','Issued','Refused','Grant Rate','Refusal Rate','Application Change','Grant Change','Refusal Rate Change','Score','Category'];
  const rows = view.countries.map(r => [r.label, r.applications, r.decisions, r.issued, r.refused, percent(r.grantRate), percent(r.refusalRate), signedPercent(r.appChangeRate), signedPercent(r.grantChangeRate), signedPercentagePoints(r.refusalRateChange), r.score === null || r.score === undefined ? '-' : r.score, r.category]);
  const csv = [headers].concat(rows).map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = 'ukvi-country-summary.csv'; a.click(); URL.revokeObjectURL(url);
}

function showSection(id, button) {
  currentSection = id;
  document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  button.classList.add('active');
  setTimeout(() => { resizeVisibleCharts(); renderCompare(); }, 120);
}
function resizeVisibleCharts() {
  CHART_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.offsetParent !== null && window.Plotly) Plotly.Plots.resize(el);
  });
}
function latestPeriodLabel(applications, outcomes) { const p = periods(applications, outcomes).pop(); return p ? `${p.y} ${p.q}` : '-'; }
function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] || 0), 0); }
function rate(n, d) { return d ? n / d : 0; }
function changeRate(current, previous) { return previous ? (current - previous) / previous : null; }
function trend(value, threshold) { if (value === null || value === undefined) return 'unknown'; return value >= threshold ? 'up' : value <= -threshold ? 'down' : 'stable'; }
function quarterSort(a, b) { return Number(String(a).replace('Q','')) - Number(String(b).replace('Q','')); }
function formatNumber(value) { return Number(value || 0).toLocaleString('en-GB'); }
function percent(value) { return (Number(value || 0) * 100).toFixed(1) + '%'; }
function signedPercent(value) { if (value === null || value === undefined || isNaN(Number(value))) return '-'; const n = Number(value) * 100; return (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
function signedPercentagePoints(value) { if (value === null || value === undefined || isNaN(Number(value))) return '-'; const n = Number(value) * 100; return (n > 0 ? '+' : '') + n.toFixed(1) + ' pp'; }
function classForSigned(value, positiveIsGood) { if (value === null || value === undefined || isNaN(Number(value))) return 'move-neutral'; if (Math.abs(Number(value)) < 0.00001) return 'move-neutral'; const good = positiveIsGood ? Number(value) > 0 : Number(value) < 0; return good ? 'move-good' : 'move-risk'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m])); }
function debounce(fn, wait) { let t; return () => { clearTimeout(t); t = setTimeout(fn, wait); }; }

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function toNumber(value) { const n = Number(String(value ?? '').replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; }
function extractQuarter(value) { const match = clean(value).toUpperCase().match(/\bQ([1-4])\b/); return match ? 'Q' + match[1] : clean(value); }
function extractYear(yearValue, quarterValue) { const direct = toNumber(yearValue); if (direct > 1900) return direct; const match = clean(quarterValue).match(/\b(20\d{2})\b/); return match ? Number(match[1]) : direct; }
function isGrant(value) { value = clean(value).toLowerCase(); return value.includes('issued') || value.includes('grant'); }
function isRefusal(value) { value = clean(value).toLowerCase(); return value.includes('refused') || value.includes('refusal') || value.includes('rejected'); }

function showError(error) { const box = document.getElementById('errorBox'); box.style.display = 'block'; box.textContent = 'Error: ' + (error.message || error); }
