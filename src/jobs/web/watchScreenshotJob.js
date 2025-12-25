
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const PNG = require('pngjs').PNG;
const configDefault = require('../../../config/config.json');
const { findPreviousSuccessRun } = require('../../runner/runUtils');

module.exports = {
    run: async (context) => {
        // Dynamic import for ESM-only packages
        const { default: pixelmatch } = await import('pixelmatch');

        const { logger, artifactsDir, timeout, args: cliArgs } = context;
        const config = configDefault.watchScreenshot || {};
        const targetUrl = cliArgs.url || config.targetUrl || 'https://example.com';
        const viewport = config.viewport || { width: 1280, height: 720 };
        const thresholdPercent = config.thresholdPercent || 0.1;


        logger.log(`Job: watchScreenshot`);
        logger.log(`Target: ${targetUrl} `);
        logger.log(`Viewport: ${viewport.width}x${viewport.height} `);

        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        try {
            await page.setViewportSize(viewport);
            logger.log(`Navigating to ${targetUrl}...`);
            await page.goto(targetUrl, { timeout: timeout, waitUntil: 'networkidle' });

            // --- IMPROVEMENT: Wait for content and handle lazy loading ---
            logger.log('Waiting for content to settle (Studio/Animations)...');
            await page.waitForTimeout(3000); // Base wait for entry animations

            // Auto-scroll to trigger lazy loading for full page screenshot
            await page.evaluate(async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 400;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeight) {
                            clearInterval(timer);
                            window.scrollTo(0, 0); // Scroll back up
                            resolve();
                        }
                    }, 100);
                });
            });
            await page.waitForTimeout(1000); // Final settle

            const currentScreenshotPath = path.join(artifactsDir, 'screenshot.png');
            await page.screenshot({ path: currentScreenshotPath, fullPage: true });
            logger.log(`Saved screenshot to ${currentScreenshotPath} `);

            // Compare logic
            const runsDir = path.resolve(artifactsDir, '../..'); // artifacts -> runId -> runs
            const previousRunPath = findPreviousSuccessRun(runsDir, 'watchScreenshot');

            const resultData = {
                changeDetected: false,
                diffPercent: 0
            };

            if (previousRunPath) {
                logger.log(`Found previous success run: ${previousRunPath} `);
                const prevScreenshotPath = path.join(previousRunPath, 'artifacts', 'screenshot.png');

                if (fs.existsSync(prevScreenshotPath)) {
                    const img1 = PNG.sync.read(fs.readFileSync(prevScreenshotPath));
                    const img2 = PNG.sync.read(fs.readFileSync(currentScreenshotPath));
                    const { width, height } = img1;
                    const diff = new PNG({ width, height });

                    // Check dimensions match
                    if (img1.width !== img2.width || img1.height !== img2.height) {
                        logger.log('Image dimensions differ, marking as changed.');
                        resultData.changeDetected = true;
                        // Could resize or just fail calc, for now just flag change.
                        resultData.diffPercent = 100;
                    } else {
                        const numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });
                        const totalPixels = width * height;
                        const diffPercent = (numDiffPixels / totalPixels) * 100;

                        logger.log(`Diff: ${numDiffPixels} pixels(${diffPercent.toFixed(4)} %)`);
                        resultData.diffPercent = diffPercent;

                        if (diffPercent > thresholdPercent) {
                            resultData.changeDetected = true;
                            const diffPath = path.join(artifactsDir, 'diff.png');
                            fs.writeFileSync(diffPath, PNG.sync.write(diff));
                            logger.log(`Change detected! Saved diff to ${diffPath} `);
                        } else {
                            logger.log(`No significant change(Threshold: ${thresholdPercent} %)`);
                        }
                    }
                } else {
                    logger.log('Previous run missing screenshot artifact pattern.');
                }
            } else {
                logger.log('No previous success run found for comparison. Keeping first screenshot.');
            }

            return resultData;

        } catch (err) {
            await page.screenshot({ path: path.join(artifactsDir, 'error-screenshot.png') }).catch(() => { });
            throw err;
        } finally {
            await browser.close();
        }
    }
};
