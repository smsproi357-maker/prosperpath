const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));

    await page.goto('http://localhost:3001/backtest.html', { waitUntil: 'networkidle0' });

    console.log("Clicking run backtest...");
    await page.click('.bt-btn-run');

    console.log("Waiting for backtest to complete...");
    await page.waitForFunction(() => {
        const btn = document.querySelector('.bt-btn-run');
        return !btn.disabled && !btn.classList.contains('running');
    }, { timeout: 10000 });

    console.log("Clicking save baseline...");
    await page.click('#btn-save-baseline');

    await new Promise(r => setTimeout(r, 1000));

    console.log("Clicking compare...");
    await page.click('#btn-compare-runs');

    await new Promise(r => setTimeout(r, 1000));

    console.log("Checking compare modal state...");
    const modalDisplay = await page.$eval('#compare-modal', el => {
        const style = window.getComputedStyle(el);
        return { display: style.display, opacity: style.opacity, visibility: style.visibility, classes: el.className };
    });
    console.log("Modal state:", modalDisplay);

    await browser.close();
})();
