window.UKVI_CONFIG = {
  API_URL: '__github_excel__',
  BUILD: '20260827-github-excel',
  EXCEL_FILE: 'UKVI Data 2020-2026 Q2.xlsx'
};

(function installGitHubExcelDataSource(){
  const sentinel = window.UKVI_CONFIG.API_URL;
  const workbookFile = window.UKVI_CONFIG.EXCEL_FILE;
  const nativeFetch = window.fetch.bind(window);

  const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const number = value => {
    const n = Number(String(value == null ? '' : value).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const quarter = value => {
    const match = clean(value).toUpperCase().match(/Q([1-4])/);
    return match ? 'Q' + match[1] : '';
  };
  const year = (yearValue, quarterValue) => {
    const direct = parseInt(String(yearValue == null ? '' : yearValue).replace(/[^0-9]/g, ''), 10);
    if (direct >= 2000 && direct <= 2100) return direct;
    const match = clean(quarterValue).match(/20\d{2}/);
    return match ? parseInt(match[0], 10) : 0;
  };
  const outcome = value => {
    const text = clean(value).toLowerCase();
    if (text.includes('issued') || text.includes('grant')) return 'issued';
    if (text.includes('refused') || text.includes('refusal') || text.includes('rejected')) return 'refused';
    return '';
  };
  const sortRows = (a, b) => a.year - b.year || Number(a.quarter[1]) - Number(b.quarter[1]) || a.nationality.localeCompare(b.nationality);

  function rowsFor(workbook, sheetName){
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error('Missing worksheet: ' + sheetName + '. Found: ' + workbook.SheetNames.join(', '));
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (!rows.length) return [];
    const first = rows[0] || [];
    const hasHeader = clean(first[0]).toLowerCase() === 'year' &&
                      clean(first[1]).toLowerCase() === 'quarter' &&
                      clean(first[2]).toLowerCase() === 'nationality';
    return hasHeader ? rows.slice(1) : rows;
  }

  function readApplications(workbook, sheetName){
    const map = new Map();
    for (const row of rowsFor(workbook, sheetName)) {
      const y = year(row[0], row[1]);
      const q = quarter(row[1]);
      const nationality = clean(row[2]);
      const applications = number(row[8]);
      if (!y || !q || !nationality || !applications) continue;
      const key = y + '|' + q + '|' + nationality;
      const current = map.get(key) || { year: y, quarter: q, nationality, applications: 0 };
      current.applications += applications;
      map.set(key, current);
    }
    return [...map.values()].sort(sortRows);
  }

  function readOutcomes(workbook, sheetName){
    const map = new Map();
    for (const row of rowsFor(workbook, sheetName)) {
      const y = year(row[0], row[1]);
      const q = quarter(row[1]);
      const nationality = clean(row[2]);
      const result = outcome(row[8]);
      const decisions = number(row[9]);
      if (!y || !q || !nationality || !result || !decisions) continue;
      const key = y + '|' + q + '|' + nationality + '|' + result;
      const current = map.get(key) || { year: y, quarter: q, nationality, outcome: result, decisions: 0 };
      current.decisions += decisions;
      map.set(key, current);
    }
    return [...map.values()].sort(sortRows);
  }

  async function buildPayload(){
    if (!window.XLSX) throw new Error('Excel reader library did not load.');

    const excelUrl = new URL(workbookFile, window.location.href);
    excelUrl.searchParams.set('v', window.UKVI_CONFIG.BUILD);
    const response = await nativeFetch(excelUrl.href, { cache: 'no-store' });
    if (!response.ok) throw new Error('Excel file returned HTTP ' + response.status);

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    return {
      status: 'ok',
      updatedAt: new Date().toISOString(),
      source: {
        type: 'github-excel',
        file: workbookFile,
        sheets: workbook.SheetNames
      },
      datasets: {
        overall: {
          applications: readApplications(workbook, 'Applied'),
          outcomes: readOutcomes(workbook, 'Outcomes')
        },
        sponsored: {
          applications: readApplications(workbook, 'Sponsored Applied'),
          outcomes: readOutcomes(workbook, 'Sponsored Outcomes')
        }
      }
    };
  }

  window.fetch = async function(input, init){
    const requestUrl = typeof input === 'string' ? input : (input && input.url) || '';
    if (!requestUrl.startsWith(sentinel)) return nativeFetch(input, init);

    try {
      const data = await buildPayload();
      return {
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => JSON.stringify(data)
      };
    } catch (error) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'error', message: error && error.message ? error.message : String(error) }),
        text: async () => JSON.stringify({ status: 'error', message: error && error.message ? error.message : String(error) })
      };
    }
  };
})();
