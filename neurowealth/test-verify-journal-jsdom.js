const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, 'backtest.html');
const jsPath = path.join(__dirname, 'backtest.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

const dom = new JSDOM(htmlContent, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable'
});

dom.window.eval(`
    // Mock BacktestEngine and localStorage
    window.BacktestEngine = {
        collectInputs: () => ({ preset_name: "CUSTOM", asset: "BTC-USD" })
    };
    
    // Polyfill localStorage
    if (!window.localStorage) {
        window.localStorage = {
            _data: {},
            getItem(key) { return this._data[key] || null; },
            setItem(key, val) { this._data[key] = String(val); },
            removeItem(key) { delete this._data[key]; },
            clear() { this._data = {}; }
        };
    }
    
    // Polyfill alert/confirm
    window.alert = function(msg) { console.log("ALERT:", msg); };
    window.confirm = function(msg) { console.log("CONFIRM:", msg); return true; };
    
    // Fix resizeObserver or chart errors if they happen
`);

dom.window.eval(jsContent);

setTimeout(() => {
    console.log("Evaluating tests inside DOM...");
    if (typeof dom.window.__ppTestVersionsFlow === 'function') {
        const res = dom.window.__ppTestVersionsFlow();
        console.log("FINAL RESULT:", res);
        process.exit(res === "PASS" ? 0 : 1);
    } else {
        console.error("Function __ppTestVersionsFlow not found on window");
        process.exit(2);
    }
}, 1000);
