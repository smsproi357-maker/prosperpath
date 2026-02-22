const puppeteer = require('puppeteer');

(async () => {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));

    console.log("Navigating to page...");
    await page.goto('http://localhost:3001/backtest.html', { waitUntil: 'networkidle0' });

    console.log("Clicking run backtest...");
    await page.click('.bt-btn-run');

    console.log("Waiting for backtest to complete...");
    await page.waitForFunction(() => {
        const btn = document.querySelector('.bt-btn-run');
        return !btn.disabled && !btn.classList.contains('running');
    }, { timeout: 10000 });

    console.log("Clicking Save Run (Snapshot)...");
    await page.click('#btn-save-run');

    await new Promise(r => setTimeout(r, 1000));

    console.log("Checking modal state...");
    const modalDisplay = await page.$eval('#save-run-modal', el => {
        const style = window.getComputedStyle(el);
        return { display: style.display, opacity: style.opacity, visibility: style.visibility, classes: el.className };
    });
    console.log("Modal state:", modalDisplay);

    console.log("Clicking Confirm Save Run...");
    await page.click('#btn-confirm-save-run');

    await new Promise(r => setTimeout(r, 1000));

    const runsList = await page.$eval('#runs-list', el => el.innerHTML);
    console.log("runs-list HTML:", runsList.substring(0, 300));

    await browser.close();
})();
