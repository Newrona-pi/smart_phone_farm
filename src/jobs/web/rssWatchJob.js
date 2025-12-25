const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { stringify } = require('csv-stringify/sync');
const configDefault = require('../../../config/config.json');
const { ensureDir } = require('../../runner/utils');
const { fetchOgImage } = require('../../lib/ogImageFetcher'); // New Helper

module.exports = {
    run: async (context) => {
        const { logger, artifactsDir } = context;
        const config = configDefault.rssWatch || {};

        logger.log(`Job: rssWatch`);

        const parser = new Parser({
            timeout: config.timeoutMs || 15000,
            customFields: {
                item: [
                    ['media:content', 'mediaContent'],
                    ['media:thumbnail', 'mediaThumbnail'],
                    ['enclosure', 'enclosure']
                ]
            }
        });

        const filters = config.filters || {};
        const feeds = config.feeds || [];
        const maxItems = config.maxItemsPerFeed || 50;
        const firstRunNoNewItems = config.firstRunNoNewItems !== false;

        const projectRoot = path.resolve(__dirname, '../../..');
        const storePath = path.join(projectRoot, config.dedupeStorePath || 'data/rss_seen.json');
        ensureDir(path.dirname(storePath));

        let seenData = { seenKeys: [] };
        if (fs.existsSync(storePath)) {
            try {
                seenData = JSON.parse(fs.readFileSync(storePath, 'utf8'));
            } catch (e) {
                logger.error(`Failed to load dedupe store: ${e.message}. Starting fresh.`);
            }
        }
        const seenSet = new Set(seenData.seenKeys);

        const results = {
            feedsTotal: feeds.length,
            feedsSucceeded: 0,
            feedsFailed: 0,
            newItemsTotal: 0,
            errors: [],
            allItems: [],
            newItems: []
        };

        for (const feedConfig of feeds) {
            logger.log(`Fetching feed: ${feedConfig.name} (${feedConfig.url})...`);
            try {
                const feed = await parser.parseURL(feedConfig.url);
                results.feedsSucceeded++;

                // Limit items
                const rawItems = feed.items.slice(0, maxItems);

                // Fetch OG images for new candidate items (to be efficient, strictly we should dedupe first)
                // But to normalize "item", we need to know if it has media.
                // Dedupe check first is efficient.

                for (const item of rawItems) {
                    const link = item.link || '';

                    // ID Generation
                    let idKey = item.guid || item.id || link;
                    if (!idKey) {
                        const raw = (item.title || '') + (item.pubDate || '') + feedConfig.name;
                        idKey = crypto.createHash('md5').update(raw).digest('hex');
                    }

                    if (seenSet.has(idKey)) {
                        continue; // Skip seen
                    }

                    // It is NEW (or first run). Normalize it.
                    let source = '';
                    try { source = new URL(link).hostname; } catch (e) { }

                    // Media Extraction (RSS Priority)
                    let mediaUrl = null;
                    // media:content
                    if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
                        mediaUrl = item.mediaContent.$.url;
                    }
                    // enclosure
                    else if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
                        mediaUrl = item.enclosure.url;
                    }
                    // media:thumbnail
                    else if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
                        mediaUrl = item.mediaThumbnail.$.url;
                    } // sometimes it's direct property depending on parser settings, but customFields helps.

                    // Fallback OG
                    if (!mediaUrl && link) {
                        // Only fetch OG if we really are going to treat this as new
                        // (To avoid request spam on every run, but here we are inside !seenSet check)
                        // But wait, if firstRunNoNewItems is true, we might not need OG. 
                        // However, we need to save the item structure correctly anyway? 
                        // Actually, if firstRunNoNewItems is true, we don't put into newItems. 
                        // So we can skip OG fetch if firstRunNoNewItems && !fs.existsSync... 
                        // BUT logic bellow handles that.

                        const reallyNew = !(firstRunNoNewItems && !fs.existsSync(storePath));
                        if (reallyNew) {
                            // logger.log(`Fetching OG for: ${item.title}`);
                            // Sequential fetch to be polite - or parallel? Sequential is safer for rate limits.
                            const og = await fetchOgImage(link);
                            if (og) mediaUrl = og;
                        }
                    }

                    const normalized = {
                        feedName: feedConfig.name,
                        title: item.title || '',
                        link: link,
                        publishedAt: item.isoDate || item.pubDate || '',
                        author: item.creator || item.author || '',
                        source: source,
                        summary: (item.contentSnippet || item.content || '').substring(0, 200),
                        idKey: idKey,
                        mediaUrl: mediaUrl || ''
                    };

                    // Filter Check
                    let pass = true;
                    if (filters.excludeSources && filters.excludeSources.includes(normalized.source)) pass = false;
                    const text = (normalized.title + ' ' + normalized.summary).toLowerCase();
                    if (pass && filters.excludeKeywords && filters.excludeKeywords.some(k => text.includes(k.toLowerCase()))) pass = false;
                    if (pass && filters.includeKeywords && filters.includeKeywords.length > 0) {
                        if (!filters.includeKeywords.some(k => text.includes(k.toLowerCase()))) pass = false;
                    }

                    if (pass) {
                        // Logic for first run
                        if (firstRunNoNewItems && !fs.existsSync(storePath)) {
                            // Mark seen, don't add to new.
                        } else {
                            results.newItems.push(normalized);
                        }
                        results.allItems.push(normalized); // Tracking for this run
                        seenSet.add(idKey);
                    }
                }

            } catch (err) {
                logger.error(`Failed to fetch ${feedConfig.name}: ${err.message}`);
                results.feedsFailed++;
                results.errors.push(`${feedConfig.name}: ${err.message}`);
            }
        }

        results.newItemsTotal = results.newItems.length;

        // Update Store
        const MAX_STORE_SIZE = 10000;
        let newSeenKeys = Array.from(seenSet);
        if (newSeenKeys.length > MAX_STORE_SIZE) {
            newSeenKeys = newSeenKeys.slice(newSeenKeys.length - MAX_STORE_SIZE);
        }
        fs.writeFileSync(storePath, JSON.stringify({ seenKeys: newSeenKeys }, null, 2));
        logger.log(`Updated dedupe store with ${newSeenKeys.length} keys.`);

        // Artifacts
        if (config.output.writeJson) {
            fs.writeFileSync(path.join(artifactsDir, 'new_items.json'), JSON.stringify(results.newItems, null, 2));
        }
        if (config.output.writeCsv) {
            const columns = ['feedName', 'title', 'link', 'publishedAt', 'source', 'mediaUrl'];
            if (results.newItems.length > 0) {
                const csvData = stringify(results.newItems, { header: true, columns });
                fs.writeFileSync(path.join(artifactsDir, 'new_items.csv'), csvData);
            } else {
                fs.writeFileSync(path.join(artifactsDir, 'new_items.csv'), columns.join(',') + '\n');
            }
        }

        fs.writeFileSync(path.join(artifactsDir, 'stats.json'), JSON.stringify({
            feedsTotal: results.feedsTotal,
            succeeded: results.feedsSucceeded,
            failed: results.feedsFailed,
            newItems: results.newItemsTotal,
            errors: results.errors
        }, null, 2));

        logger.log(`Job completed. Feeds: ${results.feedsSucceeded}/${results.feedsTotal}, New Items: ${results.newItemsTotal}`);

        if (results.feedsSucceeded === 0 && results.feedsTotal > 0) {
            throw new Error('All feeds failed.');
        }

        return {
            feedsTotal: results.feedsTotal,
            newItemsTotal: results.newItemsTotal,
            status: results.feedsSucceeded > 0 ? 'success' : 'failed'
        };
    }
};
