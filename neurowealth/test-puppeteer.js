const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

        await page.goto('http://localhost:3001/backtest.html', { waitUntil: 'networkidle0' });

        console.log("Page loaded. Injecting mock backtest data...");
        // Inject mock data so the button thinks we're ready
        await page.evaluate(() => {
            window.lastResult = { trades: [] };
            window.lastMetrics = { totalReturn: 10, maxDrawdown: 5, profitFactor: 1.5, winRate: 50 };
        });

        console.log("Clicking Save Version button...");
        await page.click('#btn-save-version');

        // Wait for modal transition
        await new Promise(r => setTimeout(r, 500));

        const modalStyle = await page.$eval('#save-version-modal', el => {
            return window.getComputedStyle(el).display;
        });
        console.log("Modal display style after click:", modalStyle);

        await browser.close();
    } catch (e) {
        console.error("Puppeteer test failed:", e);
        process.exit(1);
    }
})();
