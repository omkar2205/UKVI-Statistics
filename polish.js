function polishLabels(){
  const title = document.getElementById('reportTitle');
  if (title && title.textContent !== 'UKVI Student Visa Statistics') title.textContent = 'UKVI Student Visa Statistics';

  const connection = document.getElementById('connectionLabel');
  if (connection) connection.textContent = 'Connected to Google Sheets';

  const meta = document.getElementById('topMeta');
  if (meta) meta.textContent = 'UKVI Student Visa Statistics';

  const notice = document.getElementById('notice');
  if (notice && notice.classList.contains('success')) {
    notice.hidden = true;
    notice.textContent = '';
  }
}

polishLabels();
setInterval(polishLabels, 400);
