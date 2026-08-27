const DATA_URL = './data/dashboard-data.json';
const COLORS = {
  apps: '#5d9dcc',
  decisions: '#8099b8',
  issued: '#56b5a2',
  refused: '#df7f72',
  navy: '#315f86',
  amber: '#d5a253',
  grid: '#e9f1f8',
  text: '#172033',
  muted: '#61708a'
};
const CHART_IDS = [
  'chartApplicationsDecisions','chartRefusalTrend','chartLatestSnapshot','chartHighestRefusal','chartOutcomeMix',
  'chartApplicationsQuarter','chartApplicationsYear','chartTopApplications','chartOutcomeYear','chartRateTrend','chartOutcomeQuarter',
  'chartCountryHigh','chartCountryLow','chartCompare','chartAnalysisYear','chartScatter','chartMovement'
];
const METRIC_LABELS = {
  applications: 'Applications', decisions: 'Decisions considered', issued: 'Issued / Granted', refused: 'Refused',
  grantRate: 'Grant Rate', refusalRate: 'Refusal Rate', score: 'Movement Score'
};
const BASE_LAYOUT = {
  margin: { l: 62, r: 34, t: 18, b: 72 },
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, Segoe UI, Arial', size: 11, color: COLORS.text },
  legend: { orientation: 'h', y: -0.22 },
  xaxis: { gridcolor: COLORS.grid, zerolinecolor: COLORS.grid },
  yaxis: { gridcolor: COLORS.grid, zerolinecolor: COLORS.grid },
  hoverlabel: { bgcolor: COLORS.text, font: { color: '#fff' } }
};
const PLOT_CONFIG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] };

let allApplications = [];
let allOutcomes = [];
let years = [];
let countries = [];
let selectedCountries = [];
let view = null;
let compareSlotCount = 3;
let currentSection = 'summary';

document.addEventListener('click', event => {
  const multi = document.getElementById('countryMulti');
  if (multi && !multi.contains(event.target)) closeCountryDropdown();
});
window.addEventListener('resize', debounce(resizeVisibleCharts, 160));

async function loadData() {
  try {
    let loaded = false;
    try {
      const response = await fetch(DATA_URL, { cache: 'force-cache' });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.applied) && Array.isArray(data.outcomes)) {
          prepareRows(data);
          loaded = true;
        }
      }
    } catch (jsonError) {
      loaded = false;
    }
    if (!loaded) await loadFromExcel();
    initialiseFilters();
    initialiseCompareControls();
    applyFilters();
    document.getElementById('loadedAt').textContent = new Date().toLocaleString('en-GB');
  } catch (error) {
    showError(error);
  } finally {
    document.getElementById('load').style.display = 'none';
  }
}

async function loadFromExcel() {
  if (!window.XLSX) throw new Error('Excel parser did not load.');
  const response = await fetch('./UKVI%20Data%202020-2026%20Q2.xlsx', { cache: 'force-cache' });
  if (!response.ok) throw new Error('Could not load Excel workbook from GitHub.');
  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const appliedSheet = XLSX.utils.sheet_to_json(workbook.Sheets['Sponsored Applied'], { defval: '' });
  const outcomeSheet = XLSX.utils.sheet_to_json(workbook.Sheets['Sponsored study'], { defval: '' });
  prepareRowsFromExcel(appliedSheet, outcomeSheet);
}

function prepareRows(data) {
  const countryNames = data.countries || (data.meta && data.meta.countries) || [];
  countries = countryNames.slice();
  allApplications = (data.applied || []).map(row => ({ y: Number(row[0]), q: 'Q' + row[1], n: countries[row[2]] || 'Unknown', a: Number(row[3] || 0) }));
  allOutcomes = (data.outcomes || []).map(row => ({ y: Number(row[0]), q: 'Q' + row[1], n: countries[row[2]] || 'Unknown', i: Number(row[3] || 0), r: Number(row[4] || 0) }));
  years = (data.meta && data.meta.years ? data.meta.years : Array.from(new Set(allApplications.concat(allOutcomes).map(r => r.y)))).map(Number).sort((a,b) => a-b);
  countries = countries.slice().sort((a,b) => a.localeCompare(b));
  document.getElementById('latestPeriod').textContent = data.meta && data.meta.latestPeriod ? data.meta.latestPeriod : latestPeriodLabel(allApplications, allOutcomes);
  document.getElementById('sourceFile').textContent = data.meta && data.meta.sourceFile ? data.meta.sourceFile : 'UKVI Data 2020-2026 Q2.xlsx';
}

function prepareRowsFromExcel(appliedRows, outcomeRows) {
  const appMap = new Map();
  const outMap = new Map();
  const countrySet = new Set();
  const yearSet = new Set();
  appliedRows.forEach(row => {
    const y = extractYear(row.Year, row.Quarter);
    const q = extractQuarter(row.Quarter);
    const n = clean(row.Nationality);
    const a = toNumber(row.Applications);
    if (!y || !q || !n || !a) return;
    countrySet.add(n); yearSet.add(y);
    const key = `${y}|${q}|${n}`;
    appMap.set(key, (appMap.get(key) || 0) + a);
  });
  outcomeRows.forEach(row => {
    const outcome = clean(row['Case outcome']).toLowerCase();
    if (!isGrant(outcome) && !isRefusal(outcome)) return;
    const y = extractYear(row.Year, row.Quarter);
    const q = extractQuarter(row.Quarter);
    const n = clean(row.Nationality);
    const d = toNumber(row.Decisions);
    if (!y || !q || !n || !d) return;
    countrySet.add(n); yearSet.add(y);
    const key = `${y}|${q}|${n}`;
    const value = outMap.get(key) || { i: 0, r: 0 };
    if (isGrant(outcome)) value.i += d; else value.r += d;
    outMap.set(key, value);
  });
  allApplications = Array.from(appMap.entries()).map(([key, value]) => {
    const [y, q, n] = key.split('|');
    return { y: Number(y), q, n, a: value };
  });
  allOutcomes = Array.from(outMap.entries()).map(([key, value]) => {
    const [y, q, n] = key.split('|');
    return { y: Number(y), q, n, i: value.i, r: value.r };
  });
  countries = Array.from(countrySet).sort((a,b) => a.localeCompare(b));
  years = Array.from(yearSet).sort((a,b) => a-b);
  document.getElementById('latestPeriod').textContent = latestPeriodLabel(allApplications, allOutcomes);
  document.getElementById('sourceFile').textContent = 'UKVI Data 2020-2026 Q2.xlsx';
}

function initialiseFilters() {
  fillSelect('yearFrom', years, years[0]);
  fillSelect('yearTo', years, years[years.length - 1]);
  document.getElementById('yearFrom').onchange = () => {
    if (Number(yearFrom.value) > Number(yearTo.value)) yearTo.value = yearFrom.value;
  };
  document.getElementById('yearTo').onchange = () => {
    if (Number(yearTo.value) < Number(yearFrom.value)) yearFrom.value = yearTo.value;
  };
  renderCountryList();
}

function initialiseCompareControls() {
  fillSelect('compareYear', years, years[years.length - 1]);
  const options = document.getElementById('countryOptions');
  options.innerHTML = countries.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
  renderCompareSlots(['India', 'Pakistan', 'Nepal'].filter(c => countries.includes(c)));
  handleCompareMode();
}

function fillSelect(id, values, selected) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  values.forEach(value => el.add(new Option(value, value)));
  el.value = selected;
}

function toggleCountryDropdown(event) {
  event.stopPropagation();
  document.getElementById('countryMenu').classList.toggle('open');
}
function closeCountryDropdown() { document.getElementById('countryMenu').classList.remove('open'); }
function renderCountryList() {
  const search = (document.getElementById('countrySearch').value || '').toLowerCase();
  const filtered = countries.filter(c => c.toLowerCase().includes(search));
  document.getElementById('countryList').innerHTML = filtered.map(country => `
    <label class="country-option">
      <input type="checkbox" value="${escapeHtml(country)}" ${selectedCountries.includes(country) ? 'checked' : ''} onchange="toggleCountry(this)">
      <span>${escapeHtml(country)}</span>
    </label>`).join('') || '<div class="note">No countries found.</div>';
  updateCountryLabel();
}
function toggleCountry(input) {
  if (input.checked) selectedCountries.push(input.value);
  else selectedCountries = selectedCountries.filter(v => v !== input.value);
  selectedCountries = Array.from(new Set(selectedCountries)).sort();
  updateCountryLabel();
}
function selectVisibleCountries() {
  document.querySelectorAll('#countryList input').forEach(input => {
    if (!selectedCountries.includes(input.value)) selectedCountries.push(input.value);
    input.checked = true;
  });
  selectedCountries = Array.from(new Set(selectedCountries)).sort();
  updateCountryLabel();
}
function clearCountries() { selectedCountries = []; renderCountryList(); }
function updateCountryLabel() {
  document.getElementById('countryLabel').textContent = !selectedCountries.length
    ? 'All countries'
    : selectedCountries.length === 1 ? selectedCountries[0] + ' selected' : selectedCountries.length + ' countries selected';
}

function collectFilters() {
  return {
    yearFrom: Number(document.getElementById('yearFrom').value),
    yearTo: Number(document.getElementById('yearTo').value),
    quarter: document.getElementById('quarter').value,
    countries: selectedCountries.slice()
  };
}
function filterApplications(filters) {
  return allApplications.filter(r => r.y >= filters.yearFrom && r.y <= filters.yearTo && (filters.quarter === 'All' || r.q === filters.quarter) && (!filters.countries.length || filters.countries.includes(r.n)));
}
function filterOutcomes(filters) {
  return allOutcomes.filter(r => r.y >= filters.yearFrom && r.y <= filters.yearTo && (filters.quarter === 'All' || r.q === filters.quarter) && (!filters.countries.length || filters.countries.includes(r.n)));
}
function applyFilters() {
  const filters = collectFilters();
  const applications = filterApplications(filters);
  const outcomes = filterOutcomes(filters);
  view = buildView(applications, outcomes, filters);
  document.getElementById('activeFilterText').textContent = 'Current filters: ' + [
    `${filters.yearFrom} to ${filters.yearTo}`,
    filters.quarter === 'All' ? null : filters.quarter,
    !filters.countries.length ? 'All countries' : filters.countries.length === 1 ? filters.countries[0] : filters.countries.length + ' countries selected'
  ].filter(Boolean).join(' | ');
  renderDashboard();
  closeCountryDropdown();
}
function resetFilters() {
  selectedCountries = [];
  document.getElementById('yearFrom').value = years[0];
  document.getElementById('yearTo').value = years[years.length - 1];
  document.getElementById('quarter').value = 'All';
  document.getElementById('countrySearch').value = '';
  renderCountryList();
  applyFilters();
}
