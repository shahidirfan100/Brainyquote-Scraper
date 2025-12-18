/**
 * BrainyQuote Scraper - Production-Ready Playwright Implementation
 * Uses Firefox with stealth mode for Cloudflare bypass
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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
];

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const randomDelay = (min = 2000, max = 5000) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Build topic page URL with correct pagination format
 * Page 1: /topics/motivational-quotes
 * Page 2: /topics/motivational-quotes_2
 */
const buildTopicUrl = (topic, page = 1) => {
    const base = `${BASE_URL}/topics/${topic}-quotes`;
    return page > 1 ? `${base}_${page}` : base;
};

/**
 * Build author page URL
 * /authors/albert_einstein-quotes
 */
const buildAuthorUrl = (author, page = 1) => {
    const base = `${BASE_URL}/authors/${author}-quotes`;
    return page > 1 ? `${base}_${page}` : base;
};

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract quotes from page using correct selectors
 * Quote text: a.b-qt
 * Author: a.bq-aut (next sibling)
 */
const extractQuotesFromPage = async (page, context) => {
    const quotes = await page.evaluate((ctx) => {
        const results = [];
        const quoteElements = document.querySelectorAll('a.b-qt');

        quoteElements.forEach((quoteEl, index) => {
            const quoteText = quoteEl.textContent?.trim();
            if (!quoteText) return;

            // Author is typically the next sibling element
            const authorEl = quoteEl.parentElement?.querySelector('a.bq-aut')
                || quoteEl.nextElementSibling;
            const author = authorEl?.textContent?.trim() || null;
            const authorUrl = authorEl?.href || null;

            // Quote URL
            const quoteUrl = quoteEl.href || null;

            // Extract tags from related topic links
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
                source_url: ctx.sourceUrl,
                language: 'en',
            });
        });

        return results;
    }, context);

    return quotes;
};

/**
 * Check if there's a next page available
 */
const hasNextPage = async (page, currentPage) => {
    const nextPageNum = currentPage + 1;
    const hasNext = await page.evaluate((nextNum) => {
        // Look for pagination links
        const paginationLinks = document.querySelectorAll('.pagination a, .pager a');
        for (const link of paginationLinks) {
            if (link.textContent?.includes(String(nextNum)) || link.textContent?.includes('Next')) {
                return true;
            }
        }
        // Also check if there are any quotes on the page
        return document.querySelectorAll('a.b-qt').length > 0;
    }, nextPageNum);
    return hasNext;
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
            url = '',
            startUrls = [],
            maxPages: maxPagesRaw = 5,
            maxItems: maxItemsRaw = 200,
            proxyConfiguration: proxyConfig,
        } = input;

        const maxPages = Number.isFinite(+maxPagesRaw) ? Math.max(1, +maxPagesRaw) : 5;
        const maxItems = Number.isFinite(+maxItemsRaw) ? Math.max(1, +maxItemsRaw) : 200;

        log.info('Starting BrainyQuote scraper', { topic, author, maxPages, maxItems });

        // Create proxy configuration
        const proxyConfiguration = proxyConfig
            ? await Actor.createProxyConfiguration(proxyConfig)
            : undefined;

        // Track saved quotes
        const seen = new Set();
        let saved = 0;

        // Build initial request queue
        const requests = [];

        // Add topic pages
        const normalizedTopic = normalizeTopic(topic);
        for (let page = 1; page <= maxPages; page++) {
            requests.push({
                url: buildTopicUrl(normalizedTopic, page),
                userData: {
                    type: 'topic',
                    topic: normalizedTopic,
                    page,
                    label: `TOPIC_PAGE_${page}`,
                },
            });
        }

        // Add author pages if specified
        if (author) {
            const normalizedAuthor = normalizeAuthor(author);
            if (normalizedAuthor) {
                for (let page = 1; page <= maxPages; page++) {
                    requests.push({
                        url: buildAuthorUrl(normalizedAuthor, page),
                        userData: {
                            type: 'author',
                            author: normalizedAuthor,
                            topic: author,
                            page,
                            label: `AUTHOR_PAGE_${page}`,
                        },
                    });
                }
            }
        }

        // Add custom URL if specified
        if (url) {
            requests.push({
                url,
                userData: {
                    type: 'custom',
                    page: 1,
                    label: 'CUSTOM_URL',
                },
            });
        }

        // Add start URLs
        const normalizedStartUrls = (Array.isArray(startUrls) ? startUrls : [])
            .map((s) => (typeof s === 'string' ? s : s?.url))
            .filter(Boolean);

        for (const startUrl of normalizedStartUrls) {
            requests.push({
                url: startUrl,
                userData: {
                    type: 'startUrl',
                    page: 1,
                    label: 'START_URL',
                },
            });
        }

        log.info(`Queued ${requests.length} initial requests`);

        // Create Playwright crawler with Firefox for stealth
        const crawler = new PlaywrightCrawler({
            launchContext: {
                launcher: firefox,
                launchOptions: {
                    headless: true,
                    args: ['--disable-blink-features=AutomationControlled'],
                },
                userAgent: getRandomUserAgent(),
            },
            proxyConfiguration,
            maxConcurrency: 3,
            maxRequestRetries: 3,
            navigationTimeoutSecs: 60,
            requestHandlerTimeoutSecs: 120,

            // Pre-navigation hooks for stealth
            preNavigationHooks: [
                async ({ page, request }) => {
                    // Set random user agent
                    await page.setExtraHTTPHeaders({
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'DNT': '1',
                        'Upgrade-Insecure-Requests': '1',
                    });

                    // Block unnecessary resources for speed
                    await page.route('**/*', (route) => {
                        const resourceType = route.request().resourceType();
                        if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
                            return route.abort();
                        }
                        // Block analytics and ads
                        const url = route.request().url();
                        if (url.includes('google-analytics') ||
                            url.includes('googletagmanager') ||
                            url.includes('facebook.net') ||
                            url.includes('doubleclick')) {
                            return route.abort();
                        }
                        return route.continue();
                    });
                },
            ],

            // Main request handler
            requestHandler: async ({ page, request, log: crawlerLog }) => {
                const { userData } = request;
                const { type, topic: reqTopic, page: pageNum = 1 } = userData;

                // Check if we've hit the limit
                if (saved >= maxItems) {
                    crawlerLog.info(`Reached maxItems limit (${maxItems}), skipping request`);
                    return;
                }

                crawlerLog.info(`Processing: ${request.url} (type: ${type}, page: ${pageNum})`);

                // Wait for quotes to load
                try {
                    await page.waitForSelector('a.b-qt', { timeout: 15000 });
                } catch {
                    crawlerLog.warning(`No quotes found on page: ${request.url}`);
                    return;
                }

                // Random delay for stealth
                await sleep(randomDelay(1000, 3000));

                // Scroll to trigger any lazy loading
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight / 2);
                });
                await sleep(500);
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await sleep(500);

                // Extract quotes
                const quotes = await extractQuotesFromPage(page, {
                    topic: reqTopic || null,
                    page: pageNum,
                    sourceUrl: request.url,
                });

                if (quotes.length === 0) {
                    crawlerLog.warning(`No quotes extracted from: ${request.url}`);
                    return;
                }

                crawlerLog.info(`Found ${quotes.length} quotes on page ${pageNum}`);

                // Save quotes with deduplication
                for (const quote of quotes) {
                    if (saved >= maxItems) break;

                    // Create unique key for deduplication
                    const key = quote.quote_url || `${quote.quote}-${quote.author}`;
                    if (key && seen.has(key)) continue;
                    if (key) seen.add(key);

                    await Dataset.pushData({
                        ...quote,
                        scraped_at: new Date().toISOString(),
                    });
                    saved++;

                    if (saved % 10 === 0) {
                        crawlerLog.info(`Progress: ${saved}/${maxItems} quotes saved`);
                    }
                }
            },

            // Handle failures gracefully
            failedRequestHandler: async ({ request, log: crawlerLog }, error) => {
                crawlerLog.error(`Request failed: ${request.url}`, { error: error.message });
            },
        });

        // Run the crawler
        await crawler.run(requests);

        log.info(`Scraping completed. Total quotes saved: ${saved}`);

    } catch (error) {
        log.error('Scraper failed with error:', { error: error.message });
        throw error;
    } finally {
        await Actor.exit();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
