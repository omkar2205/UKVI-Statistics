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

// Current source layout:
// A = Year, B = Quarter, C = Nationality, I = Applications / Case outcome, J = Decisions.
// Applied, Sponsored Applied and Sponsored Outcomes have a header row.
// Outcomes currently starts directly with data in row 1.
const HEADER_ROWS = {
  'Applied': 1,
  'Outcomes': 0,
  'Sponsored Applied': 1,
  'Sponsored Outcomes': 1
};

function doGet(e) {
  const startedAt = Date.now();
  const params = e && e.parameter ? e.parameter : {};
  const callback = cleanCallback_(params.callback);

  try {
    // Tiny endpoint for checking that the deployed Web App is reachable.
    if (String(params.mode || '').toLowerCase() === 'ping') {
      return jsonOutput({
        status: 'ok',
        ping: true,
        updatedAt: new Date().toISOString(),
        buildMs: Date.now() - startedAt
      }, callback);
    }

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

  // Read each source tab only once. This avoids the repeated range calls in the
  // earlier version, which were the main performance bottleneck.
  const overallApplications = readApplications_(ss, SHEETS.overall.applications);
  const overallOutcomes = readOutcomes_(ss, SHEETS.overall.outcomes);
  const sponsoredApplications = readApplications_(ss, SHEETS.sponsored.applications);
  const sponsoredOutcomes = readOutcomes_(ss, SHEETS.sponsored.outcomes);

  return {
    status: 'ok',
    updatedAt: new Date().toISOString(),
    source: {
      spreadsheetId: SPREADSHEET_ID,
      title: ss.getName(),
      sheets: [
        overallApplications.meta,
        overallOutcomes.meta,
        sponsoredApplications.meta,
        sponsoredOutcomes.meta
      ]
    },
    datasets: {
      overall: {
        applications: overallApplications.data,
        outcomes: overallOutcomes.data
      },
      sponsored: {
        applications: sponsoredApplications.data,
        outcomes: sponsoredOutcomes.data
      }
    }
  };
}

function readApplications_(ss, sheetName) {
  const sheet = getSheet_(ss, sheetName);
  const startRow = (HEADER_ROWS[sheetName] || 0) + 1;
  const lastRow = sheet.getLastRow();
  const numRows = Math.max(0, lastRow - startRow + 1);
  const meta = {
    name: sheetName,
    rows: numRows,
    columns: sheet.getLastColumn()
  };

  if (!numRows) return { data: [], meta: meta };

  // One bulk read for this tab: A:I.
  const values = sheet.getRange(startRow, 1, numRows, 9).getValues();
  const map = Object.create(null);

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const year = normaliseYear_(row[0], row[1]);
    const quarter = normaliseQuarter_(row[1]);
    const nationality = clean_(row[2]);
    const value = number_(row[8]);

    if (!year || !quarter || !nationality || !value) continue;

    const key = year + '|' + quarter + '|' + nationality;
    if (!map[key]) {
      map[key] = {
        year: year,
        quarter: quarter,
        nationality: nationality,
        applications: 0
      };
    }
    map[key].applications += value;
  }

  return {
    data: Object.keys(map).map(function(key) { return map[key]; }).sort(sortPeriodNationality_),
    meta: meta
  };
}

function readOutcomes_(ss, sheetName) {
  const sheet = getSheet_(ss, sheetName);
  const startRow = (HEADER_ROWS[sheetName] || 0) + 1;
  const lastRow = sheet.getLastRow();
  const numRows = Math.max(0, lastRow - startRow + 1);
  const meta = {
    name: sheetName,
    rows: numRows,
    columns: sheet.getLastColumn()
  };

  if (!numRows) return { data: [], meta: meta };

  // One bulk read for this tab: A:J.
  const values = sheet.getRange(startRow, 1, numRows, 10).getValues();
  const map = Object.create(null);

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const year = normaliseYear_(row[0], row[1]);
    const quarter = normaliseQuarter_(row[1]);
    const nationality = clean_(row[2]);
    const outcome = normaliseOutcome_(row[8]);
    const decisions = number_(row[9]);

    if (!year || !quarter || !nationality || !outcome || !decisions) continue;

    const key = year + '|' + quarter + '|' + nationality + '|' + outcome;
    if (!map[key]) {
      map[key] = {
        year: year,
        quarter: quarter,
        nationality: nationality,
        outcome: outcome,
        decisions: 0
      };
    }
    map[key].decisions += decisions;
  }

  return {
    data: Object.keys(map).map(function(key) { return map[key]; }).sort(sortPeriodNationality_),
    meta: meta
  };
}

function getSheet_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(
      'Missing sheet: ' + sheetName + '. Available sheets: ' +
      ss.getSheets().map(function(s) { return s.getName(); }).join(', ')
    );
  }
  return sheet;
}

function normaliseOutcome_(value) {
  const text = clean_(value).toLowerCase();
  if (text.indexOf('issued') !== -1 || text.indexOf('grant') !== -1) return 'issued';
  if (
    text.indexOf('refused') !== -1 ||
    text.indexOf('refusal') !== -1 ||
    text.indexOf('rejected') !== -1
  ) return 'refused';
  return '';
}

function normaliseQuarter_(value) {
  const text = clean_(value).toUpperCase();
  const match = text.match(/Q([1-4])/);
  return match ? 'Q' + match[1] : '';
}

function normaliseYear_(yearValue, quarterValue) {
  const direct = parseInt(String(yearValue == null ? '' : yearValue).replace(/[^0-9]/g, ''), 10);
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
  return a.year - b.year ||
    Number(a.quarter[1]) - Number(b.quarter[1]) ||
    a.nationality.localeCompare(b.nationality);
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
