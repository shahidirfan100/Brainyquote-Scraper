// BrainyQuote motivational quotes scraper
import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';
import { load as cheerioLoad } from 'cheerio';

await Actor.init();

const DEFAULT_TOPIC = 'motivational';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const toAbs = (href, base = 'https://www.brainyquote.com') => {
    try { return new URL(href, base).href; } catch { return null; }
};

const cleanText = (html) => {
    if (!html) return '';
    const $ = cheerioLoad(html);
    $('script, style, noscript, iframe').remove();
    return $.root().text().replace(/\s+/g, ' ').trim();
};

const normalizeTopic = (value = DEFAULT_TOPIC) => {
    const trimmed = String(value).trim().toLowerCase();
    return trimmed.replace(/\s+/g, '-').replace(/-quotes$/, '') || DEFAULT_TOPIC;
};

const topicUrl = (slug, page = 1) => {
    const base = `https://www.brainyquote.com/topics/${slug}-quotes`;
    return page > 1 ? `${base}?pg=${page}` : base;
};

const unwrapMaybeJson = (body) => {
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object') {
            if (typeof parsed.content === 'string') return parsed.content;
            if (Array.isArray(parsed.content)) return parsed.content.join('\n');
        }
    } catch (_) {
        /* body was not JSON */
    }
    return body;
};

const parseQuotes = ($, context) => {
    const quotes = [];

    const candidates = $('.grid-item, article, .qti-list .listItem, .m-brick').filter((_, el) => {
        const text = cleanText($(el).text());
        return /quote/i.test(text) || $(el).find('a[href*="/quotes/"]').length;
    });

    candidates.each((index, el) => {
        const root = $(el);
        const quoteText = root.find('a[title*="quote"], .b-qt, .quoteText, .qti-listm .clearfix a, [data-quote]').first().text().trim()
            || root.attr('data-quote') || null;
        const author = root.find('a[title*="author"], .bq-aut, .author, a[href*="/authors/"]').first().text().trim() || null;
        const url = toAbs(root.find('a[href*="/quotes/"]').first().attr('href'))
            || toAbs(root.find('a[title*="quote"], a:contains("quote")').first().attr('href'))
            || context?.sourceUrl;
        const tags = root.find('a[href*="/topics/"]').map((_, a) => $(a).text().trim()).get().filter(Boolean);

        if (!quoteText) return;

        quotes.push({
            quote: quoteText,
            author: author || null,
            topic: context?.topic || null,
            tags: tags.length ? Array.from(new Set(tags)) : (context?.topic ? [context.topic] : []),
            quote_url: url || null,
            page: context?.page || 1,
            position: quotes.length + 1,
            source: context?.source || 'html',
            source_url: context?.sourceUrl || null,
            language: 'en',
        });
    });

    return quotes;
};

const fetchBody = async (url, proxyConfiguration) => {
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
    const { body } = await gotScraping({
        url,
        proxyUrl,
        timeout: { request: 30000 },
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json' },
        http2: true,
    });
    return body;
};

const fetchApiPage = async (topic, page, proxyConfiguration) => {
    const url = new URL('https://www.brainyquote.com/api/inf');
    url.searchParams.set('typ', 'topic');
    url.searchParams.set('langc', 'en');
    url.searchParams.set('ab', '0');
    url.searchParams.set('pg', String(page));
    url.searchParams.set('tf', '1');
    url.searchParams.set('t', topic);
    const body = await fetchBody(url.href, proxyConfiguration);
    return unwrapMaybeJson(body);
};

const fetchHtmlPage = async (topic, page, proxyConfiguration) => {
    const url = topicUrl(topic, page);
    const body = await fetchBody(url, proxyConfiguration);
    return { body, url };
};

const normalizeAuthor = (value = '') => {
    const trimmed = String(value).trim().toLowerCase();
    return trimmed.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            topic = DEFAULT_TOPIC,
            topics = [],
            author = '',
            url = '',
            startUrls = [],
            maxPages: maxPagesRaw = 5,
            maxItems: maxItemsRaw = 200,
            preferApi = true,
            proxyConfiguration,
        } = input;

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined;
        const maxPages = Number.isFinite(+maxPagesRaw) ? Math.max(1, +maxPagesRaw) : 5;
        const maxItems = Number.isFinite(+maxItemsRaw) ? Math.max(1, +maxItemsRaw) : 200;

        const topicList = Array.isArray(topics) && topics.length ? topics : [topic];
        const normalizedTopics = topicList.map(normalizeTopic);
        const normalizedStartUrls = (Array.isArray(startUrls) ? startUrls : [])
            .map((s) => (typeof s === 'string' ? s : s?.url))
            .filter(Boolean);

        if (author) {
            const authorSlug = normalizeAuthor(author);
            if (authorSlug) {
                normalizedStartUrls.push(`https://www.brainyquote.com/authors/${authorSlug}-quotes`);
            }
        }
        if (url) {
            normalizedStartUrls.push(url);
        }

        const seen = new Set();
        let saved = 0;

        for (const slug of normalizedTopics) {
            if (saved >= maxItems) break;
            log.info(`Scraping topic: ${slug}`);

            for (let page = 1; page <= maxPages && saved < maxItems; page++) {
                let html = null;
                let sourceUrl = null;
                let usedApi = false;

                if (preferApi) {
                    try {
                        html = await fetchApiPage(slug, page, proxyConf);
                        sourceUrl = `https://www.brainyquote.com/api/inf?typ=topic&t=${slug}&pg=${page}`;
                        usedApi = true;
                    } catch (err) {
                        log.warning(`API fetch failed for topic=${slug}, page=${page}: ${err.message}. Falling back to HTML.`);
                    }
                }

                if (!html) {
                    const res = await fetchHtmlPage(slug, page, proxyConf);
                    html = res.body;
                    sourceUrl = res.url;
                    usedApi = false;
                }

                const $ = cheerioLoad(html);
                const items = parseQuotes($, { topic: slug, page, source: usedApi ? 'api' : 'html', sourceUrl });

                if (!items.length) {
                    log.info(`No quotes found for topic=${slug} page=${page}; stopping pagination.`);
                    break;
                }

                for (const item of items) {
                    if (saved >= maxItems) break;
                    const key = item.quote_url || `${item.topic}-${item.quote}`;
                    if (key && seen.has(key)) continue;
                    if (key) seen.add(key);

                    await Dataset.pushData({
                        ...item,
                        scraped_at: new Date().toISOString(),
                    });
                    saved++;
                }
            }
        }

        if (normalizedStartUrls.length && saved < maxItems) {
            for (const url of normalizedStartUrls) {
                if (saved >= maxItems) break;
                try {
                    const body = await fetchBody(url, proxyConf);
                    const $ = cheerioLoad(body);
                    const items = parseQuotes($, { topic: null, page: 1, source: 'html', sourceUrl: url });
                    for (const item of items) {
                        if (saved >= maxItems) break;
                        const key = item.quote_url || `${item.quote}-${item.author}`;
                        if (key && seen.has(key)) continue;
                        if (key) seen.add(key);
                        await Dataset.pushData({ ...item, scraped_at: new Date().toISOString() });
                        saved++;
                    }
                } catch (err) {
                    log.warning(`Failed to scrape startUrl=${url}: ${err.message}`);
                }
            }
        }

        log.info(`Finished. Saved ${saved} quotes.`);
    } finally {
        await Actor.exit();
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
