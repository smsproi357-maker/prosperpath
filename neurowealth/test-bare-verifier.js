const fs = require('fs');

// 1. Simulating LocalStorage
global.localStorage = {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, val) { this._data[key] = String(val); },
    removeItem(key) { delete this._data[key]; },
    clear() { this._data = {}; }
};

// 2. Simulating DOM document for Backtest UI
const mockElement = {
    value: '',
    innerHTML: '',
    style: {},
    addEventListener: () => { },
    dispatchEvent: () => { },
    querySelectorAll: () => [],
    appendChild: () => { },
    classList: { remove: () => { }, contains: () => false, add: () => { } },
    getContext: () => ({ fillRect: () => { }, beginPath: () => { }, moveTo: () => { }, lineTo: () => { }, stroke: () => { }, arc: () => { }, fill: () => { } })
};

global.document = {
    readyState: 'loading',
    addEventListener: () => { },
    createElement: () => mockElement,
    getElementById: (id) => mockElement,
    querySelectorAll: () => [],
    body: { appendChild: () => { }, style: {} },
    head: { appendChild: () => { }, style: {} }
};

global.window = {
    addEventListener: () => { },
    alert: (msg) => console.log("[ALERT]", msg),
    confirm: (msg) => { console.log("[CONFIRM]", msg); return true; },
    BacktestEngine: {
        collectInputs: () => ({ preset_name: "CUSTOM", asset: "BTC-USD" })
    }
};

global.Event = class Event { };

// Mock other globals the script might try to use
global.initTabs = () => { };
global.initToggles = () => { };
global.initRunButton = () => { };
global.initIndicators = () => { };
global.initAIStrategyModal = () => { };
global.initPresets = () => { };
global.initExports = () => { };
global.initExplainButton = () => { };
global.handleResize = () => { };
global.buildReportObj = () => ({ config: { preset_name: "CUSTOM", asset: "BTC-USD" } });

// 3. Load script and execute
const script = fs.readFileSync('./backtest.js', 'utf8');

try {
    eval(script);

    // Explicitly map these to global space since eval inside IIFE creates a detached global for 'window'
    global.handleJournalLoad = window.handleJournalLoad;
    global.handleJournalCompare = window.handleJournalCompare;

    // Trigger DOM load
    document.readyState = 'complete';
    if (typeof init === 'function') init();

    setTimeout(() => {
        console.log("Executing test flow...");
        const result = window.__ppTestVersionsFlow();
        console.log("TEST FLOW RESULT:", result);
        process.exit(result === 'PASS' ? 0 : 1);
    }, 100);

} catch (e) {
    console.error("Test execution failed:", e);
    process.exit(1);
}
