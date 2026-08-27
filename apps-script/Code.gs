const SPREADSHEET_ID = '18x1I2_PpHs7iIMDS_9J4ByUNRfOTUzHFvtkfdQgWLx0';
const SHEETS = {
  overall: {
    applications: 'Applied',
    outcomes: 'Outcomes'
  },
  sponsored: {
    applications: 'Sponsored Applied',
    outcomes: 'Sponsored Outcomes'
  }
};

function doGet(e) {
  try {
    const payload = buildPayload();
    return jsonOutput(payload);
  } catch (err) {
    return jsonOutput({
      status: 'error',
      message: err && err.message ? err.message : String(err),
      updatedAt: new Date().toISOString()
    });
  }
}

function buildPayload() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return {
    status: 'ok',
    updatedAt: new Date().toISOString(),
    source: {
      spreadsheetId: SPREADSHEET_ID,
      title: ss.getName(),
      sheets: ss.getSheets().map(sheet => ({
        name: sheet.getName(),
        rows: Math.max(0, sheet.getLastRow() - 1),
        columns: sheet.getLastColumn()
      }))
    },
    datasets: {
      overall: {
        applications: readApplications_(ss, SHEETS.overall.applications),
        outcomes: readOutcomes_(ss, SHEETS.overall.outcomes)
      },
      sponsored: {
        applications: readApplications_(ss, SHEETS.sponsored.applications),
        outcomes: readOutcomes_(ss, SHEETS.sponsored.outcomes)
      }
    }
  };
}

function readApplications_(ss, sheetName) {
  const sheet = getSheet_(ss, sheetName);
  const rows = readRows_(sheet);
  const map = {};
  rows.forEach(row => {
    const year = normaliseYear_(row.Year, row.Quarter);
    const quarter = normaliseQuarter_(row.Quarter);
    const nationality = clean_(row.Nationality);
    const applications = number_(row.Applications);
    if (!year || !quarter || !nationality || !applications) return;
    const key = [year, quarter, nationality].join('|');
    if (!map[key]) map[key] = { year, quarter, nationality, applications: 0 };
    map[key].applications += applications;
  });
  return Object.keys(map).map(key => map[key]).sort(sortPeriodNationality_);
}

function readOutcomes_(ss, sheetName) {
  const sheet = getSheet_(ss, sheetName);
  const rows = readRows_(sheet);
  const map = {};
  rows.forEach(row => {
    const year = normaliseYear_(row.Year, row.Quarter);
    const quarter = normaliseQuarter_(row.Quarter);
    const nationality = clean_(row.Nationality);
    const outcome = normaliseOutcome_(row['Case outcome'] || row.Outcome);
    const decisions = number_(row.Decisions);
    if (!year || !quarter || !nationality || !outcome || !decisions) return;
    const key = [year, quarter, nationality, outcome].join('|');
    if (!map[key]) map[key] = { year, quarter, nationality, outcome, decisions: 0 };
    map[key].decisions += decisions;
  });
  return Object.keys(map).map(key => map[key]).sort(sortPeriodNationality_);
}

function getSheet_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Missing sheet: ' + sheetName + '. Available sheets: ' + ss.getSheets().map(s => s.getName()).join(', '));
  }
  return sheet;
}

function readRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values.shift().map(h => clean_(h));
  return values.map(valuesRow => {
    const row = {};
    headers.forEach((header, index) => row[header] = valuesRow[index]);
    return row;
  });
}

function normaliseOutcome_(value) {
  const text = clean_(value).toLowerCase();
  if (text.indexOf('issued') !== -1 || text.indexOf('grant') !== -1) return 'issued';
  if (text.indexOf('refused') !== -1 || text.indexOf('refusal') !== -1 || text.indexOf('rejected') !== -1) return 'refused';
  return '';
}

function normaliseQuarter_(value) {
  const text = clean_(value).toUpperCase();
  const match = text.match(/Q([1-4])/);
  return match ? 'Q' + match[1] : '';
}

function normaliseYear_(yearValue, quarterValue) {
  const direct = parseInt(String(yearValue).replace(/[^0-9]/g, ''), 10);
  if (direct >= 2000 && direct <= 2100) return direct;
  const match = clean_(quarterValue).match(/20\d{2}/);
  return match ? parseInt(match[0], 10) : 0;
}

function clean_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function number_(value) {
  const n = Number(String(value == null ? '' : value).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

function sortPeriodNationality_(a, b) {
  return a.year - b.year || Number(a.quarter[1]) - Number(b.quarter[1]) || a.nationality.localeCompare(b.nationality);
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
