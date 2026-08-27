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

// UKVI source layout used by all four tabs:
// A = Year, B = Quarter, C = Nationality, I = Applications / Case outcome, J = Decisions.
// Reading only the columns the dashboard needs is much faster than reading all 26 columns.
const COL = {
  YEAR: 1,
  QUARTER: 2,
  NATIONALITY: 3,
  APPLICATIONS: 9,
  OUTCOME: 9,
  DECISIONS: 10
};

function doGet(e) {
  const startedAt = Date.now();
  const callback = e && e.parameter ? cleanCallback_(e.parameter.callback) : '';

  try {
    const payload = buildPayload();
    payload.buildMs = Date.now() - startedAt;
    return jsonOutput(payload, callback);
  } catch (err) {
    return jsonOutput({
      status: 'error',
      message: err && err.message ? err.message : String(err),
      updatedAt: new Date().toISOString(),
      buildMs: Date.now() - startedAt
    }, callback);
  }
}

function buildPayload() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const configuredNames = [
    SHEETS.overall.applications,
    SHEETS.overall.outcomes,
    SHEETS.sponsored.applications,
    SHEETS.sponsored.outcomes
  ];

  return {
    status: 'ok',
    updatedAt: new Date().toISOString(),
    source: {
      spreadsheetId: SPREADSHEET_ID,
      title: ss.getName(),
      sheets: configuredNames.map(name => {
        const sheet = getSheet_(ss, name);
        return {
          name: sheet.getName(),
          rows: dataRowCount_(sheet),
          columns: sheet.getLastColumn()
        };
      })
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
  const bounds = dataBounds_(sheet);
  if (!bounds.numRows) return [];

  const abc = sheet.getRange(bounds.startRow, COL.YEAR, bounds.numRows, 3).getValues();
  const applications = sheet.getRange(bounds.startRow, COL.APPLICATIONS, bounds.numRows, 1).getValues();
  const map = {};

  for (let i = 0; i < bounds.numRows; i++) {
    const year = normaliseYear_(abc[i][0], abc[i][1]);
    const quarter = normaliseQuarter_(abc[i][1]);
    const nationality = clean_(abc[i][2]);
    const value = number_(applications[i][0]);
    if (!year || !quarter || !nationality || !value) continue;

    const key = [year, quarter, nationality].join('|');
    if (!map[key]) map[key] = { year, quarter, nationality, applications: 0 };
    map[key].applications += value;
  }

  return Object.keys(map).map(key => map[key]).sort(sortPeriodNationality_);
}

function readOutcomes_(ss, sheetName) {
  const sheet = getSheet_(ss, sheetName);
  const bounds = dataBounds_(sheet);
  if (!bounds.numRows) return [];

  const abc = sheet.getRange(bounds.startRow, COL.YEAR, bounds.numRows, 3).getValues();
  const outcomeDecision = sheet.getRange(bounds.startRow, COL.OUTCOME, bounds.numRows, 2).getValues();
  const map = {};

  for (let i = 0; i < bounds.numRows; i++) {
    const year = normaliseYear_(abc[i][0], abc[i][1]);
    const quarter = normaliseQuarter_(abc[i][1]);
    const nationality = clean_(abc[i][2]);
    const outcome = normaliseOutcome_(outcomeDecision[i][0]);
    const decisions = number_(outcomeDecision[i][1]);
    if (!year || !quarter || !nationality || !outcome || !decisions) continue;

    const key = [year, quarter, nationality, outcome].join('|');
    if (!map[key]) map[key] = { year, quarter, nationality, outcome, decisions: 0 };
    map[key].decisions += decisions;
  }

  return Object.keys(map).map(key => map[key]).sort(sortPeriodNationality_);
}

function getSheet_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Missing sheet: ' + sheetName + '. Available sheets: ' + ss.getSheets().map(s => s.getName()).join(', '));
  }
  return sheet;
}

function dataBounds_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return { startRow: 1, numRows: 0 };

  // Three tabs contain headers, while the current overall Outcomes tab starts directly with data.
  // Detect the header rather than assuming row 1 is always a header.
  const first = sheet.getRange(1, 1, 1, Math.min(10, sheet.getLastColumn())).getDisplayValues()[0];
  const hasHeader = clean_(first[0]).toLowerCase() === 'year' &&
                    clean_(first[1]).toLowerCase() === 'quarter' &&
                    clean_(first[2]).toLowerCase() === 'nationality';
  const startRow = hasHeader ? 2 : 1;
  return { startRow, numRows: Math.max(0, lastRow - startRow + 1) };
}

function dataRowCount_(sheet) {
  return dataBounds_(sheet).numRows;
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

function cleanCallback_(value) {
  const callback = clean_(value);
  return /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback) ? callback : '';
}

function jsonOutput(payload, callback) {
  const json = JSON.stringify(payload);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
