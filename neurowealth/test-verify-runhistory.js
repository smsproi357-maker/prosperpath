const jsdom = require("jsdom");
const fs = require("fs");
const { JSDOM } = jsdom;

const html = fs.readFileSync('backtest.html', 'utf-8');
const js = fs.readFileSync('backtest.js', 'utf-8');

const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
const document = window.document;

// Simulate localStorage
window.localStorage = {
    store: {},
    getItem: function (key) { return this.store[key] || null; },
    setItem: function (key, value) { this.store[key] = value.toString(); },
    removeItem: function (key) { delete this.store[key]; }
};

// Simple mocks
window.alert = console.log;
window.console.log = function () { };
window.console.error = function () { };

try {
    const scriptEl = document.createElement("script");
    scriptEl.textContent = js;
    document.body.appendChild(scriptEl);
} catch (e) {
    console.log("Script load error", e);
}

// Trigger DOMContentLoaded manually if needed
document.dispatchEvent(new window.Event('DOMContentLoaded'));

setTimeout(() => {
    const btnSaveRun = document.getElementById('btn-save-run');
    console.log("btn-save-run exists:", !!btnSaveRun);

    // Check if modal exists
    const modal = document.getElementById('save-run-modal');
    console.log("save-run-modal exists:", !!modal);
    console.log("Initial modal display classes:", modal.className);

    // Simulate currentReport
    window.currentReport = {
        config: { preset_name: "Test" },
        metrics: { totalReturn: "10.0" }
    };

    if (btnSaveRun) {
        btnSaveRun.click();
        console.log("Clicked btn-save-run");
        console.log("Modal class after click:", modal.className);

        const srName = document.getElementById('sr-name');
        console.log("sr-name input exists:", !!srName);
        console.log("sr-name value:", srName ? srName.value : 'null');

        const btnConfirm = document.getElementById('btn-confirm-save-run');
        if (btnConfirm) {
            btnConfirm.click();
            console.log("Clicked btn-confirm-save-run");

            const runsStr = window.localStorage.getItem('pp_backtest_runs_v1');
            console.log("Runs in storage:", runsStr ? runsStr.substring(0, 100) + '...' : 'empty');

            const listEl = document.getElementById('runs-list');
            console.log("list elements count:", listEl ? listEl.children.length : 0);
        }
    }
}, 500);
