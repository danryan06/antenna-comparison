// Page script for edit.html. Loaded as a classic script at the end of <body>,
// after the shared helpers it uses, so top-level names stay global.
const params = new URLSearchParams(window.location.search);
const returnId = params.get('id') || '';
params.delete('id');
const backQs = params.toString();
const back = document.getElementById('back-link');
if (returnId) back.href = 'antenna.html?id=' + encodeURIComponent(returnId) + (backQs ? '&' + backQs : '');
else back.href = backQs ? 'index.html?' + backQs : 'index.html';
initAntennaSubmissionPage({ kind: 'edit' });
