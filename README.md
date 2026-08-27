# UKVI Statistics Dashboard

Static GitHub Pages version of the UKVI Sponsored Study Visa dashboard.

## Files

- `index.html` – dashboard front end
- `UKVI Data 2020-2026 Q2.xlsx` – source Excel workbook
- `data/dashboard-data.json` – optional preprocessed data placeholder

## How it works

The dashboard loads the Excel workbook directly from this repository and reads these two sheets:

- `Sponsored Applied` for application volumes
- `Sponsored study` for outcomes

Outcome analysis includes only Issued/Granted and Refused decisions.

## Publishing

To publish through GitHub Pages:

1. Open repository Settings
2. Go to Pages
3. Select Deploy from branch
4. Select branch `main`
5. Select folder `/root`
6. Save

The public dashboard link should become:

`https://omkar2205.github.io/UKVI-Statistics/`

## Updating data

For future releases, upload the updated Excel workbook to the repository and update the file name in `index.html` if the workbook name changes.
