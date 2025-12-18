/**
 * BrainyQuote Scraper - Production-Ready Optimized Implementation
 * Fast, stealthy extraction with immediate shutdown on quota
 */
import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';
import { firefox } from 'playwright';

await Actor.init();

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TOPIC = 'motivational';
const BASE_URL = 'https://www.brainyquote.com';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// ─────────────────────────────────────────────────────────────────────────────
// URL BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

const normalizeTopic = (value = DEFAULT_TOPIC) => {
    const trimmed = String(value).trim().toLowerCase();
    return trimmed.replace(/\s+/g, '-').replace(/-quotes$/, '') || DEFAULT_TOPIC;
};

const normalizeAuthor = (value = '') => {
    const trimmed = String(value).trim().toLowerCase();
    return trimmed.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};

const buildTopicUrl = (topic, page = 1) => {
    const base = `${BASE_URL}/topics/${topic}-quotes`;
    return page > 1 ? `${base}_${page}` : base;
};

const buildAuthorUrl = (author, page = 1) => {
    const base = `${BASE_URL}/authors/${author}-quotes`;
    return page > 1 ? `${base}_${page}` : base;
};

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL STATE
// ─────────────────────────────────────────────────────────────────────────────

const seen = new Set();
let saved = 0;
let maxItems = 200;
let crawlerInstance = null;

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

const extractQuotesFromPage = async (page, context) => {
    return await page.evaluate((ctx) => {
        const results = [];
        const quoteElements = document.querySelectorAll('a.b-qt');

        quoteElements.forEach((quoteEl, index) => {
            const quoteText = quoteEl.textContent?.trim();
            if (!quoteText) return;

            const authorEl = quoteEl.parentElement?.querySelector('a.bq-aut')
                || quoteEl.nextElementSibling;
            const author = authorEl?.textContent?.trim() || null;
            const authorUrl = authorEl?.href || null;
            const quoteUrl = quoteEl.href || null;

            const tagLinks = quoteEl.closest('.grid-item, .m-brick, article')
                ?.querySelectorAll('a[href*="/topics/"]') || [];
            const tags = Array.from(tagLinks)
                .map((a) => a.textContent?.trim())
                .filter(Boolean);

            results.push({
                quote: quoteText,
                author,
                author_url: authorUrl,
                quote_url: quoteUrl,
                topic: ctx.topic,
                tags: tags.length ? [...new Set(tags)] : ctx.topic ? [ctx.topic] : [],
                page: ctx.page,
                position: index + 1,
                source: 'playwright',
                language: 'en',
            });
        });

        return results;
    }, context);
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCRAPER
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            topic = DEFAULT_TOPIC,
            author = '',
            startUrls = [],
            maxPages: maxPagesRaw = 5,
            maxItems: maxItemsRaw = 200,
            proxyConfiguration: proxyConfig,
        } = input;

        const maxPages = Number.isFinite(+maxPagesRaw) ? Math.max(1, +maxPagesRaw) : 5;
        maxItems = Number.isFinite(+maxItemsRaw) ? Math.max(1, +maxItemsRaw) : 200;

        log.info('Starting BrainyQuote scraper', { topic, author, maxPages, maxItems });

        const proxyConfiguration = proxyConfig
            ? await Actor.createProxyConfiguration(proxyConfig)
            : undefined;

        // Build initial request queue
        const requests = [];

        const normalizedTopic = normalizeTopic(topic);
        for (let page = 1; page <= maxPages; page++) {
            requests.push({
                url: buildTopicUrl(normalizedTopic, page),
                userData: { type: 'topic', topic: normalizedTopic, page },
            });
        }

        if (author) {
            const normalizedAuthor = normalizeAuthor(author);
            if (normalizedAuthor) {
                for (let page = 1; page <= maxPages; page++) {
                    requests.push({
                        url: buildAuthorUrl(normalizedAuthor, page),
                        userData: { type: 'author', topic: author, page },
                    });
                }
            }
        }

        const normalizedStartUrls = (Array.isArray(startUrls) ? startUrls : [])
            .map((s) => (typeof s === 'string' ? s : s?.url))
            .filter(Boolean);

        for (const startUrl of normalizedStartUrls) {
            requests.push({
                url: startUrl,
                userData: { type: 'startUrl', page: 1 },
            });
        }

        log.info(`Queued ${requests.length} initial requests`);

        // Create optimized Playwright crawler
        crawlerInstance = new PlaywrightCrawler({
            launchContext: {
                launcher: firefox,
                launchOptions: { headless: true },
                userAgent: getRandomUserAgent(),
            },
            proxyConfiguration,
            maxConcurrency: 5, // Higher concurrency for speed
            maxRequestRetries: 1, // Fewer retries - if blocked, move on
            navigationTimeoutSecs: 30, // Faster timeout
            requestHandlerTimeoutSecs: 45,

            // Block heavy resources
            preNavigationHooks: [
                async ({ page }) => {
                    await page.route('**/*', (route) => {
                        const type = route.request().resourceType();
                        const url = route.request().url();

                        // Block images, fonts, media, analytics
                        if (['image', 'font', 'media', 'stylesheet'].includes(type) ||
                            url.includes('google-analytics') ||
                            url.includes('googletagmanager') ||
                            url.includes('facebook') ||
                            url.includes('doubleclick') ||
                            url.includes('adsense')) {
                            return route.abort();
                        }
                        return route.continue();
                    });
                },
            ],

            requestHandler: async ({ page, request, crawler }) => {
                const { userData } = request;
                const { topic: reqTopic, page: pageNum = 1 } = userData;

                // FAST EXIT: Check limit before any processing
                if (saved >= maxItems) {
                    log.info(`Quota reached (${saved}/${maxItems}), aborting crawler`);
                    await crawler.autoscaledPool?.abort();
                    return;
                }

                log.info(`Processing: ${request.url} (page: ${pageNum})`);

                // Quick wait for content
                try {
                    await page.waitForSelector('a.b-qt', { timeout: 10000 });
                } catch {
                    log.warning(`No quotes found: ${request.url}`);
                    return;
                }

                // Fast scroll to load lazy content
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

                // Extract quotes
                const quotes = await extractQuotesFromPage(page, {
                    topic: reqTopic || null,
                    page: pageNum,
                });

                if (!quotes.length) {
                    log.warning(`No quotes extracted: ${request.url}`);
                    return;
                }

                log.info(`Found ${quotes.length} quotes on page ${pageNum}`);

                // Save quotes with deduplication
                const toSave = [];
                for (const quote of quotes) {
                    if (saved + toSave.length >= maxItems) break;

                    const key = quote.quote_url || `${quote.quote}-${quote.author}`;
                    if (key && seen.has(key)) continue;
                    if (key) seen.add(key);

                    toSave.push({
                        ...quote,
                        scraped_at: new Date().toISOString(),
                    });
                }

                // Batch push for speed
                if (toSave.length > 0) {
                    await Dataset.pushData(toSave);
                    saved += toSave.length;
                    log.info(`Progress: ${saved}/${maxItems} quotes saved`);
                }

                // FAST EXIT: Abort immediately if we hit the limit
                if (saved >= maxItems) {
                    log.info(`Quota filled, stopping crawler immediately`);
                    await crawler.autoscaledPool?.abort();
                }
            },

            failedRequestHandler: async ({ request }, error) => {
                // Don't retry 403s - just log and move on
                if (error.message?.includes('403')) {
                    log.warning(`Blocked (403): ${request.url} - skipping`);
                } else {
                    log.error(`Failed: ${request.url}`, { error: error.message });
                }
            },
        });

        await crawlerInstance.run(requests);

        log.info(`✅ Completed! Total quotes saved: ${saved}`);

    } catch (error) {
        log.error('Scraper error:', { error: error.message });
        throw error;
    } finally {
        await Actor.exit();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
