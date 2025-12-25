const { chromium } = require('playwright');
const path = require('path');

module.exports = {
    /**
     * Run the demo job.
     * @param {Object} context
     * @param {Object} context.logger - Logger instance
     * @param {string} context.artifactsDir - Path to save artifacts
     * @param {number} context.timeout - Timeout in ms
     */
    run: async (context) => {
        const { logger, artifactsDir, timeout } = context;

        logger.log('Launching browser...');
        const browser = await chromium.launch({ headless: true }); // headless: true by default, can be config driven if needed
        const contextBrowser = await browser.newContext();
        const page = await contextBrowser.newPage();

        try {
            // Calculate absolute path to demo site
            const demoPath = path.resolve(__dirname, '../../..', 'demo/site/index.html');
            const fileUrl = `file://${demoPath}`;

            logger.log(`Navigating to: ${fileUrl}`);
            // Use a shorter timeout for navigation relative to job timeout, or pass job timeout
            await page.goto(fileUrl, { timeout: timeout });

            // Verify Initial State
            const initialText = await page.textContent('#status-text');
            logger.log(`Initial status: "${initialText}"`);

            if (initialText !== 'Ready to run...') {
                throw new Error(`Unexpected initial text: ${initialText}`);
            }

            // Perform Action
            logger.log('Clicking action button...');
            await page.click('#action-btn');

            // Verify Result
            const invalidText = await page.textContent('#status-text'); // wait for it? Playwright auto-waits for click but maybe not text update if async?
            // In this simple manual JS, it's sync.

            // Let's verify with assertion-like logic
            const finalText = await page.textContent('#status-text');
            logger.log(`Final status: "${finalText}"`);

            if (finalText !== 'Action Executed!') {
                throw new Error(`Assertion Failed: Expected "Action Executed!", got "${finalText}"`);
            }

            // Take Screenshot
            const screenshotPath = path.join(artifactsDir, 'screenshot.png');
            await page.screenshot({ path: screenshotPath });
            logger.log(`Screenshot saved to: ${screenshotPath}`);

        } catch (err) {
            // Take error screenshot if possible
            try {
                await page.screenshot({ path: path.join(artifactsDir, 'error-screenshot.png') });
            } catch (e) { /* ignore */ }
            throw err;
        } finally {
            await browser.close();
            logger.log('Browser closed.');
        }
    }
};
