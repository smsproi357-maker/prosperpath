const fs = require('fs');
const htmlFile = 'c:\\Users\\smspr\\Downloads\\kebo1dd\\neurowealth\\backtest.html';
let html = fs.readFileSync(htmlFile, 'utf8');

// Restore inline onclicks
html = html.replace('id="btn-save-version"', 'id="btn-save-version" onclick="openSaveVersionModal()"');
html = html.replace('id="btn-journal-load"', 'id="btn-journal-load" onclick="handleJournalLoad()"');
html = html.replace('id="btn-journal-compare"', 'id="btn-journal-compare" onclick="handleJournalCompare()"');
html = html.replace('id="btn-journal-delete"', 'id="btn-journal-delete" onclick="handleJournalDelete()"');

fs.writeFileSync(htmlFile, html, 'utf8');
console.log('Restored inline handlers.');
