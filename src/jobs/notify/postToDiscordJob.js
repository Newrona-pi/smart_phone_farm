const fs = require('fs');
const path = require('path');
const configDefault = require('../../../config/config.json');
const { findPreviousSuccessRun } = require('../../runner/runUtils');
require('dotenv').config();

module.exports = {
    run: async (context) => {
        const { logger, artifactsDir } = context;
        let config = configDefault.postToDiscord || {};

        // Resolve ENV variables in config
        if (config.webhookUrl && config.webhookUrl.startsWith('ENV:')) {
            const envKey = config.webhookUrl.split(':')[1];
            config.webhookUrl = process.env[envKey];
        }

        if (!config.webhookUrl) {
            throw new Error('Discord Webhook URL is missing. Check config.json and .env');
        }

        const maxPosts = config.maxPostsPerRun || 3;
        const username = config.username || 'AI News Bot';

        logger.log(`Job: postToDiscord`);
        logger.log(`Max Posts: ${maxPosts}`);


        // 1. Find latest run data (Composed OR RSS)
        const runsDir = path.resolve(artifactsDir, '../..');

        // Check for composePost run first
        let sourceRunPath = findPreviousSuccessRun(runsDir, 'composePost');
        let itemsFile = sourceRunPath ? path.join(sourceRunPath, 'artifacts', 'composed_items.json') : null;
        let isComposed = true;

        if (!itemsFile || !fs.existsSync(itemsFile)) {
            // Fallback to rssWatch
            logger.log("No composed_items.json found. Falling back to rssWatch new_items.json");
            sourceRunPath = findPreviousSuccessRun(runsDir, 'rssWatch');
            itemsFile = sourceRunPath ? path.join(sourceRunPath, 'artifacts', 'new_items.json') : null;
            isComposed = false;
        }

        if (!itemsFile || !fs.existsSync(itemsFile)) {
            logger.log(`No items file found. Skipping.`);
            return { processed: 0, sent: 0 };
        }

        const items = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
        if (items.length === 0) {
            logger.log('No items to post. Skipping.');
            return { processed: 0, sent: 0 };
        }

        logger.log(`Found ${items.length} items from ${path.basename(sourceRunPath || '')} (Composed: ${isComposed})`);

        let sentCount = 0;
        let failedCount = 0;
        const itemsToPost = items.slice(0, maxPosts);

        for (const entry of itemsToPost) {
            let embed = {};

            if (isComposed) {
                const c = entry.composed;
                const o = entry.originalItem;

                const bodyLines = [
                    ...(c.lines || []),
                    c.disclaimer ? `\n⚠️ ${c.disclaimer}` : '',
                    `\n${o.link}`
                ].filter(Boolean).join('\n');

                embed = {
                    title: c.titleLine || o.title,
                    description: bodyLines,
                    // url: o.link, // URL in description for better visibility or Keep title clickable
                    url: o.link,
                    footer: { text: `${o.source || 'News'} | Tone: ${c.tone || 'normal'}` },
                    image: o.mediaUrl ? { url: o.mediaUrl } : undefined,
                    timestamp: o.publishedAt ? new Date(o.publishedAt).toISOString() : new Date().toISOString()
                };

                if (c.tone === 'high') embed.color = 0x57F287;
                else if (c.tone === 'low') embed.color = 0xED4245;
                else embed.color = 0x3498DB;

            } else {
                const o = entry;
                embed = {
                    title: o.title,
                    description: (o.summary || '').substring(0, 140),
                    url: o.link,
                    footer: { text: o.source || o.feedName || '' },
                    image: o.mediaUrl ? { url: o.mediaUrl } : undefined,
                    timestamp: o.publishedAt ? new Date(o.publishedAt).toISOString() : new Date().toISOString()
                };
            }

            const payload = {
                username: username,
                avatar_url: config.avatarUrl,
                embeds: [embed]
            };

            try {
                logger.log(`Posting: ${embed.title}`);
                const response = await fetch(config.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Discord API ${response.status}: ${text}`);
                }
                sentCount++;
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
                logger.error(`Failed to post item: ${err.message}`);
                failedCount++;
            }
        }

        logger.log(`Done. Sent: ${sentCount}, Failed: ${failedCount}`);

        if (sentCount === 0 && failedCount > 0) {
            throw new Error('All Discord posts failed.');
        }

        return {
            processed: itemsToPost.length,
            sent: sentCount,
            failed: failedCount
        };
    }
};
