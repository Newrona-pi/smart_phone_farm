const axios = require('axios');
const cheerio = require('cheerio');

async function fetchOgImage(url) {
    if (!url) return null;
    try {
        const response = await axios.get(url, {
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const html = response.data;
        const $ = cheerio.load(html);
        const ogImage = $('meta[property="og:image"]').attr('content');
        return ogImage || null;
    } catch (error) {
        // console.warn(`Failed to fetch OG image for ${url}: ${error.message}`);
        return null;
    }
}

module.exports = { fetchOgImage };
