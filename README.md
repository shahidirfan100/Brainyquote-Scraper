# BrainyQuote Quotes Scraper

Collect motivational and topic-based quotes from BrainyQuote with an API-first approach and an HTML fallback that keeps results flowing even when the internal endpoint is rate-limited.

<p><strong>Designed for Apify:</strong> clean input schema, dataset views, proxy support, and pagination controls so runs pass QA without surprises.</p>

## What this actor does

- Targets BrainyQuote topics such as motivational, success, happiness, and more.
- Tries the BrainyQuote API endpoint first, then gracefully falls back to HTML pages.
- Paginates through `?pg=` pages until `maxPages` or `maxItems` is reached.
- Deduplicates quote URLs across topics and custom start URLs.
- Stores a tidy dataset with quote, author, topic, tags, source type, page number, and timestamps.

## Quick start

1. Open the actor on Apify and provide a topic (e.g., `motivational`) or a list under **Additional topics**.
2. Leave **Prefer BrainyQuote API** enabled; set **Max pages per topic** and **Max quotes to collect** as needed.
3. Run the actor. Results appear in the default dataset view (`overview`) with ready-to-download links.

## Input fields

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| topic | string | motivational | Primary topic slug without `-quotes`. |
| topics | array<string> | — | Optional list of topics to scrape in one run. |
| maxPages | integer | 5 | How many paginated pages to fetch per topic. |
| maxItems | integer | 200 | Global quote limit across all topics and start URLs. |
| preferApi | boolean | true | Use the internal BrainyQuote API first; fall back to HTML if unavailable. |
| startUrls | array<Request> | — | Optional BrainyQuote topic or quote URLs to scrape directly. |
| proxyConfiguration | object | `{ "useApifyProxy": true }` | Configure Apify Proxy. |

## Output

Each dataset item looks like this:

```
{
  "quote": "The future depends on what you do today.",
  "author": "Mahatma Gandhi",
  "topic": "motivational",
  "tags": ["motivational"],
  "quote_url": "https://www.brainyquote.com/quotes/mahatma_gandhi_109075",
  "source": "api",
  "page": 1,
  "scraped_at": "2025-12-18T10:00:00.000Z"
}
```

## How it works

- Normalizes topics (removes `-quotes`, slugifies spaces) and builds topic URLs.
- Calls `https://www.brainyquote.com/api/inf` with topic and page parameters. If it fails or returns empty HTML, it switches to the topic page `https://www.brainyquote.com/topics/{topic}-quotes?pg={n}`.
- Parses quote cards, authors, and topic links, de-duplicates by quote URL, and stops when `maxItems` is met.
- Saves everything to the default dataset with the `overview` view for quick inspection.

## Usage tips

- Keep **preferApi** on for speed; turn it off only if you consistently see empty API responses.
- Increase **maxPages** for broader coverage; lower **maxItems** for lightweight tests.
- Add **startUrls** for niche topics or individual quote pages you want included.
- Use Apify Proxy for stability; datacenter proxy is usually sufficient.

## Troubleshooting

- Empty dataset: check that the topic exists on BrainyQuote (e.g., try `motivational`, `success`, `leadership`).
- Repeated quotes: ensure `startUrls` do not overlap heavily with the selected topics.
- Pagination stops early: BrainyQuote may not have more pages for that topic; reduce **maxPages** or switch topics.

## Running locally

```
npm install
npm start
```

Provide input via `INPUT.json` or the Apify CLI. Results land in the default dataset directory created by the platform.