const fs = require('fs');
const { JSDOM } = require("jsdom");

const html = fs.readFileSync('backtest.html', 'utf8');
const js = fs.readFileSync('backtest.js', 'utf8');
const engine = fs.readFileSync('backtest-engine.js', 'utf8');

const dom = new JSDOM(html, { runScripts: "outside-only" });

const localStorageMock = (function () {
    let store = {};
    return {
        getItem: function (key) { return store[key] || null; },
        setItem: function (key, value) { store[key] = value.toString(); },
        removeItem: function (key) { delete store[key]; },
        clear: function () { store = {}; }
    };
})();
dom.window.localStorage = localStorageMock;

dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    fillRect: () => { },
    clearRect: () => { },
    getImageData: () => ({ data: new Array(4) }),
    putImageData: () => { },
    createImageData: () => ({ data: new Array(4) }),
    setTransform: () => { },
    drawImage: () => { },
    save: () => { },
    fillText: () => { },
    restore: () => { },
    beginPath: () => { },
    moveTo: () => { },
    lineTo: () => { },
    closePath: () => { },
    stroke: () => { },
    translate: () => { },
    scale: () => { },
    rotate: () => { },
    arc: () => { },
    fill: () => { },
    measureText: () => ({ width: 0 }),
    transform: () => { },
    rect: () => { },
    clip: () => { },
});

dom.window.fetch = () => Promise.resolve({
    json: () => Promise.resolve([])
});

dom.window.alert = function (msg) { console.log("ALERT:", msg) };
dom.window.confirm = function (msg) { console.log("CONFIRM:", msg); return true; };

let toastMsg = "";
dom.window.showToast = function (msg) { toastMsg = msg; };

try {
    dom.window.eval(engine);
    dom.window.eval(js);
    console.log("Scripts executed.");
} catch (e) {
    console.error("ERROR ON LOAD:", e.message);
}

setTimeout(() => {
    // Force currentReport
    dom.window.currentReport = {
        config: { preset_name: "Mock Preset" },
        metrics: { totalReturn: 10, maxDrawdown: 5, profitFactor: 1.5, tradeCount: 5 }
    };

    // Simulate Save Run click
    const btnSaveRun = dom.window.document.getElementById('btn-save-run');
    if (btnSaveRun) {
        btnSaveRun.click();
        console.log("Save Run clicked. Modal class:", dom.window.document.getElementById('save-run-modal').className);

        // Simulate confirm
        const btnConfirm = dom.window.document.getElementById('btn-confirm-save-run');
        if (btnConfirm) btnConfirm.click();

        setTimeout(() => {
            const list = dom.window.document.getElementById('runs-list');
            console.log("Runs list HTML:", list ? list.innerHTML.trim() : 'missing');
            console.log("Storage:", localStorageMock.getItem('pp_backtest_runs_v1'));
        }, 100);
    } else {
        console.log("btn-save-run missing");
    }
}, 500);
