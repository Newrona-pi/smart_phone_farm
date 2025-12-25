const { chromium, request } = require('playwright');
const path = require('path');
const fs = require('fs');
const configDefault = require('../../../config/config.json');

module.exports = {
    run: async (context) => {
        const { logger, artifactsDir, timeout, args: cliArgs } = context;
        const config = configDefault.linkCheck || {};
        const targetUrl = cliArgs.url || config.targetUrl || 'https://example.com';
        const sameHostOnly = config.sameHostOnly !== false; // default true
        const maxLinks = config.maxLinks || 50;
        const linkTimeout = config.timeoutMs || 10000;
        const failOnAnyError = config.failOnAnyError || false;

        logger.log(`Job: linkCheck`);
        logger.log(`Target: ${targetUrl}`);
        logger.log(`MaxLinks: ${maxLinks}, SameHost: ${sameHostOnly}`);

        const browser = await chromium.launch({ headless: true });
        // Use request context for HEAD/GET requests to perform checks efficiently
        const requestContext = await request.newContext({
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();
        const results = [];
        let hasError = false;

        try {
            logger.log(`Navigating to source...`);
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: timeout });

            // Wait for JS rendering (Studio sites can be slow)
            logger.log('Waiting for content to render (5s)...');
            await page.waitForTimeout(5000);

            // Extract Links
            const rawLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter(href => href.startsWith('http')); // Filter basic http/s
            });

            // Dedup
            const uniqueLinks = Array.from(new Set(rawLinks));

            // Filter by host if needed
            let targetLinks = uniqueLinks;
            const targetUrlObj = new URL(targetUrl);
            const normalizeHost = (h) => h.replace(/^www\./, '');
            const targetHost = normalizeHost(targetUrlObj.hostname);
            if (sameHostOnly) {
                targetLinks = uniqueLinks.filter(l => {
                    try {
                        const linkHost = normalizeHost(new URL(l).hostname);
                        return linkHost === targetHost;
                    } catch (e) { return false; }
                });
            }

            // Limit count
            targetLinks = targetLinks.slice(0, maxLinks);
            logger.log(`Found ${uniqueLinks.length} links, checking ${targetLinks.length} (Max: ${maxLinks})...`);

            // Check Loop
            for (const [index, link] of targetLinks.entries()) {
                const start = Date.now();
                let status = 'unknown';
                let ok = false;
                let errorMsg = '';

                try {
                    // Try HEAD first
                    let response = await requestContext.head(link, { timeout: linkTimeout });
                    // If 405 Method Not Allowed or other 4xx, sometimes HEAD is blocked, try GET
                    if (response.status() === 405 || response.status() === 404 || response.status() >= 400) {
                        response = await requestContext.get(link, { timeout: linkTimeout });
                    }

                    status = response.status();
                    ok = response.ok();
                    if (!ok) {
                        errorMsg = `Status ${status}`;
                        hasError = true;
                    }
                } catch (err) {
                    status = 'error';
                    errorMsg = err.message;
                    ok = false;
                    hasError = true;
                }

                const elapsed = Date.now() - start;
                logger.log(`[${index + 1}/${targetLinks.length}] ${link} -> ${status} (${elapsed}ms)`);

                results.push({
                    url: link,
                    status,
                    ok,
                    error: errorMsg,
                    elapsedMs: elapsed
                });
            }

            // Save Reports
            const reportJsonPath = path.join(artifactsDir, 'report.json');
            fs.writeFileSync(reportJsonPath, JSON.stringify(results, null, 2));

            const reportCsvPath = path.join(artifactsDir, 'report.csv');
            const csvHeader = 'url,status,ok,error,elapsedMs\n';
            const csvRows = results.map(r => `"${r.url}",${r.status},${r.ok},"${r.error}",${r.elapsedMs}`).join('\n');
            fs.writeFileSync(reportCsvPath, csvHeader + csvRows);

            logger.log(`Reports saved to ${reportJsonPath} and ${reportCsvPath}`);

            if (failOnAnyError && hasError) {
                throw new Error('Some links failed check (failOnAnyError=true).');
            }

            return {
                totalChecked: targetLinks.length,
                failedCount: results.filter(r => !r.ok).length
            };

        } catch (err) {
            throw err;
        } finally {
            await requestContext.dispose();
            await browser.close();
        }
    }
};
