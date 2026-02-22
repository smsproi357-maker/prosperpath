const fs = require('fs');
const { JSDOM } = require("jsdom");

const html = fs.readFileSync('backtest.html', 'utf8');
const js = fs.readFileSync('backtest.js', 'utf8');
const engine = fs.readFileSync('backtest-engine.js', 'utf8');

const dom = new JSDOM(html, { runScripts: "outside-only" });

// Mock localStorage to simulate a totally clean state
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

// Mock context APIs and fetch
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

try {
    dom.window.eval(engine);
    dom.window.eval(js);
    console.log("Scripts executed without immediate crash.");
} catch (e) {
    console.error("CRITICAL SCRIPT ERROR ON LOAD:", e);
}

setTimeout(() => {
    const btn = dom.window.document.getElementById('btn-save-version');
    const modal = dom.window.document.getElementById('save-version-modal');
    console.log("btn-save-version attached events?", btn ? btn.outerHTML : 'Missing element');

    // Attempt simulated click
    if (btn) {
        console.log("Simulating click on Save Version button...");
        const event = new dom.window.Event('click', { bubbles: true });
        btn.dispatchEvent(event);
        console.log("Modal display style after click:", modal ? modal.style.display : 'No Modal');
    }
}, 500);
