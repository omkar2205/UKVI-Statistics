# UKVI Study Visa Reporting

Plain analytics-style reporting dashboard for UKVI study visa data.

## Data source

The GitHub Pages frontend no longer reads an Excel workbook from the repository. It is designed to read a JSON feed from Google Apps Script connected to the Google Sheet:

- Google Sheet: `UKVI Data 2020-2026 Q2`
- Spreadsheet ID: `18x1I2_PpHs7iIMDS_9J4ByUNRfOTUzHFvtkfdQgWLx0`
- Sheets used:
  - `Applied`
  - `Outcomes`
  - `Sponsored Applied`
  - `Sponsored Outcomes`

## Files

- `index.html` - page structure
- `style.css` - plain analytics/reporting layout
- `app.js` - dashboard logic and charts
- `config.js` - Apps Script Web App URL
- `apps-script/Code.gs` - Google Apps Script backend

## Apps Script setup

1. Open the Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Replace the script code with `apps-script/Code.gs` from this repository.
4. Deploy as a **Web app**.
5. Set access to **Anyone**.
6. Copy the `/exec` Web App URL.
7. Paste that URL into `config.js` as `API_URL`.

After this, the site will load data from Google Sheets through Apps Script.
