const fs = require('fs');

const html = fs.readFileSync('backtest.html', 'utf8');
const js = fs.readFileSync('backtest.js', 'utf8');

console.log("--- DIAGONSTICS ---");
console.log("HTML has id='btn-save-version':", html.includes('id="btn-save-version"'));
console.log("JS has getElementById('btn-save-version'):", js.includes("getElementById('btn-save-version')"));

const initMatch = js.match(/function\s+initVersionModals\s*\([^)]*\)\s*\{/);
console.log("JS has initVersionModals function:", !!initMatch);

const callMatch = js.match(/initVersionModals\s*\(/);
console.log("JS CALLS initVersionModals:", !!callMatch);

const callerMatch = js.match(/initVersions\s*\([^)]*\)\s*\{[^}]*initVersionModals/);
console.log("JS initVersions calls initVersionModals:", !!callerMatch);

console.log("init() calls initVersions:", js.includes('initVersions();'));
