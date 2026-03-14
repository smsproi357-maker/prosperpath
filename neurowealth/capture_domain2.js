const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'domain2');

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function captureScreenshots() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    const modules = [
        { id: '2.1', url: '/module-2-1.html' },
        { id: '2.2', url: '/module-2-2.html' },
        { id: '2.3', url: '/module-2-3.html' },
        { id: '2.4', url: '/module-2-4.html' },
        { id: '2.5', url: '/module-2-5.html' },
    ];

    // Capture Landing Page
    console.log('Capturing Landing Page...');
    await page.goto(`${BASE_URL}/market-context.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'domain2__landing__0__0__market-context.png') });

    for (const mod of modules) {
        console.log(`Starting Module ${mod.id}...`);
        await page.goto(`${BASE_URL}${mod.url}`, { waitUntil: 'networkidle' });

        let screenIndex = 0;
        let hasNext = true;

        while (hasNext) {
            // Get current section and slug info
            const sectionInfo = await page.evaluate(() => {
                if (typeof STATE === 'undefined') return { sectionLabel: 'unknown', screenIndex: 0 };
                const sec = SECTIONS[STATE.currentSectionId];
                return {
                    sectionLabel: sec ? sec.label.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'unknown',
                    screenIndex: STATE.currentScreenIndex,
                    sectionId: STATE.currentSectionId
                };
            });

            const slug = sectionInfo.sectionLabel;
            const filename = `domain2__mod${mod.id.replace('.', '_')}__sec${sectionInfo.sectionId}__scr${screenIndex}__${slug}.png`;

            console.log(`  Capturing ${filename}...`);
            await page.waitForTimeout(1000); // Animation delay
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename) });
            screenIndex++;

            // Check for Clarify buttons
            const clarifyButtons = await page.$$('.clarify-btn');
            for (let i = 0; i < clarifyButtons.length; i++) {
                console.log(`    Capturing Clarify Panel ${i + 1}...`);
                await clarifyButtons[i].click();
                await page.waitForTimeout(800);
                const clarifyFilename = `domain2__mod${mod.id.replace('.', '_')}__sec${sectionInfo.sectionId}__scr${screenIndex - 1}__clarify_${i}__${slug}.png`;
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, clarifyFilename) });
                await page.click('#cp-close');
                await page.waitForTimeout(500);
            }

            // Handle Assessment Questions if visible
            const optButtons = await page.$$('.opt-btn:not(:disabled)');
            if (optButtons.length > 0) {
                console.log('    Answering assessment question...');
                await optButtons[0].click();
                await page.waitForTimeout(500);
            }

            // Try to click "Continue" or "Next" or "Submit"
            const continueButton = await page.$('button.btn-primary:not(:disabled), button.mm-btn-primary:not(:disabled)');

            if (continueButton) {
                const buttonText = await continueButton.innerText();
                if (buttonText.toLowerCase().includes('finish module') || buttonText.toLowerCase().includes('exit')) {
                    // Check if there's a completion screen first
                    if (mod.id === '2.5' && buttonText.toLowerCase().includes('finish')) {
                        // Might transition to domain-complete.html
                    }
                    hasNext = false;
                } else {
                    await continueButton.click();
                    await page.waitForLoadState('networkidle');
                }
            } else {
                hasNext = false;
            }

            // Check if we reached the completion screen for Domain 2
            const isCompleteScreen = await page.evaluate(() => {
                return window.location.href.includes('domain2-complete.html') || !!document.querySelector('.result-title.result-gold');
            });

            if (isCompleteScreen) {
                console.log('  Capturing Completion Screen...');
                await page.waitForTimeout(1000);
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, `domain2__complete__final.png`) });
                hasNext = false;
            }

            // Safety break
            if (screenIndex > 100) {
                console.log('  Safety limit reached, stopping module.');
                hasNext = false;
            }
        }
    }

    console.log('Capture finished.');
    await browser.close();
}

captureScreenshots().catch(err => {
    console.error('Error during capture:', err);
    process.exit(1);
});
