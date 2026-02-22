const puppeteer = require('puppeteer');
const path = require('path');

async function testVersionsFlow() {
    console.log("Starting Puppeteer for Verification...");
    const browser = await puppeteer.launch({
        headless: "new"
    });
    const page = await browser.newPage();

    // Inject mock BacktestEngine if needed to prevent errors on load
    await page.evaluateOnNewDocument(() => {
        window.BacktestEngine = {
            collectInputs: () => ({ asset: "BTC", preset_name: "CUSTOM" }),
        };
    });

    const filePath = `file://${path.resolve('c:/Users/smspr/Downloads/kebo1dd/neurowealth/backtest.html')}`;
    console.log("Navigating to: " + filePath);

    page.on('console', msg => {
        if (msg.text().includes('PASS') || msg.text().includes('FAIL') || msg.text().includes('Test')) {
            console.log(msg.text());
        }
    });

    await page.goto(filePath, { waitUntil: 'networkidle0' });

    console.log("Executing __ppTestVersionsFlow...");
    const result = await page.evaluate(() => {
        if (typeof window.__ppTestVersionsFlow === 'function') {
            return window.__ppTestVersionsFlow();
        } else {
            return "FUNCTION NOT FOUND";
        }
    });

    console.log("Final Script Result: " + result);
    await browser.close();
}

testVersionsFlow().catch(console.error);
