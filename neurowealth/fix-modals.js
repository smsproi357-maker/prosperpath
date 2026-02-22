const fs = require('fs');
const htmlFile = 'c:\\Users\\smspr\\Downloads\\kebo1dd\\neurowealth\\backtest.html';
let html = fs.readFileSync(htmlFile, 'utf8');

// 1. Remove inline onclick handlers
html = html.replace('onclick="openSaveVersionModal()"', '');
html = html.replace('onclick="handleJournalLoad()"', '');
html = html.replace('onclick="handleJournalCompare()"', '');
html = html.replace('onclick="handleJournalDelete()"', '');

// 2. Move modals to end of body
const modalStartIdx = html.indexOf('            <!-- AI Strategy Modal -->');
const modalEndIdx = html.indexOf('        </main>');

if (modalStartIdx !== -1 && modalEndIdx !== -1) {
    const modalsStr = html.substring(modalStartIdx, modalEndIdx);

    // Remove modals from inside main
    html = html.substring(0, modalStartIdx) + html.substring(modalEndIdx);

    // Find script tags
    const scriptIdx = html.indexOf('    <script src="script.js"></script>');
    if (scriptIdx !== -1) {
        // Insert modals before scripts
        html = html.substring(0, scriptIdx) + modalsStr + html.substring(scriptIdx);
    }
}

fs.writeFileSync(htmlFile, html, 'utf8');
console.log('HTML modified successfully.');
