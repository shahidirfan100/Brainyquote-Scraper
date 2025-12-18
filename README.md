# BrainyQuote Quotes Scraper

**Collect inspirational and motivational quotes from BrainyQuote effortlessly.** This Apify actor scrapes quotes by topic, author, or custom URLs, prioritizing API access with HTML fallback for reliable data extraction.

## Features

- **Topic-Based Scraping**: Scrape quotes from popular topics like motivational, success, happiness, and leadership.
- **Author Search**: Find quotes from specific authors such as Albert Einstein or Mahatma Gandhi.
- **Custom URLs**: Add start URLs for targeted scraping of quote pages or author profiles.
- **API-First Approach**: Uses BrainyQuote's internal API for fast results, falls back to HTML parsing if needed.
- **Pagination Support**: Automatically handles page navigation with configurable limits.
- **Deduplication**: Removes duplicate quotes across runs for clean datasets.
- **Proxy Integration**: Built-in Apify Proxy support for scalable and compliant scraping.
- **SEO-Friendly Output**: Structured data with quotes, authors, topics, and timestamps for easy indexing.

## Input Parameters

Configure the scraper with these input fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `topic` | string | `motivational` | Primary topic slug (e.g., `motivational`, `success`). |
| `author` | string | - | Author name for quote search (e.g., `Albert Einstein`). |
| `url` | string | - | Direct BrainyQuote URL to scrape. |
| `startUrls` | array | - | List of URLs for additional scraping. |
| `maxPages` | integer | 5 | Maximum pages per topic to scrape. |
| `maxItems` | integer | 200 | Total quotes to collect. |
| `preferApi` | boolean | `true` | Prefer API over HTML scraping. |
| `proxyConfiguration` | object | `{ "useApifyProxy": true }` | Proxy settings for Apify. |

## Output Data

Each scraped quote is saved as a dataset item with this structure:

```json
{
  "quote": "The only way to do great work is to love what you do.",
  "author": "Steve Jobs",
  "topic": "motivational",
  "tags": ["motivational", "work"],
  "quote_url": "https://www.brainyquote.com/quotes/steve_jobs_123456",
  "source": "api",
  "page": 1,
  "scraped_at": "2025-12-18T10:00:00.000Z"
}
```

- **quote**: The full quote text.
- **author**: Quote author (if available).
- **topic**: Associated topic.
- **tags**: Related tags.
- **quote_url**: Link to the original quote page.
- **source**: Data source (`api` or `html`).
- **page**: Page number where found.
- **scraped_at**: Timestamp of scraping.

## Usage Examples

### Scrape Motivational Quotes
Set `topic` to `motivational` and run for up to 200 quotes.

### Search by Author
Enter `Albert Einstein` in `author` to collect Einstein's quotes.

### Custom URL Scraping
Provide a BrainyQuote URL in `url` or `startUrls` for specific pages.

### Large-Scale Collection
Increase `maxPages` to 10 and `maxItems` to 1000 for extensive datasets.

## Configuration Tips

- **API vs. HTML**: Enable `preferApi` for speed; disable if API blocks occur.
- **Pagination**: Adjust `maxPages` based on topic popularity.
- **Limits**: Use `maxItems` to control dataset size and costs.
- **Proxies**: Always use Apify Proxy for ethical scraping.

## How It Works

1. **Input Processing**: Normalizes topics and builds URLs.
2. **API Attempt**: Queries BrainyQuote API for quotes.
3. **Fallback Parsing**: If API fails, parses HTML pages.
4. **Data Extraction**: Collects quotes, authors, and metadata.
5. **Deduplication**: Ensures unique quotes.
6. **Output**: Saves to Apify dataset with overview view.

## Troubleshooting

- **No Results**: Verify topic/author exists on BrainyQuote.
- **API Errors**: Switch `preferApi` to `false`.
- **Duplicates**: Check for overlapping URLs.
- **Rate Limits**: Reduce `maxPages` or use proxies.
- **Timeouts**: Lower `maxItems` for faster runs.

## Running Locally

For local testing:

```bash
npm install
npm start
```

Use `INPUT.json` for configuration. Results save to the dataset folder.

---

**Boost your content with fresh quotes!** This scraper helps bloggers, marketers, and developers access inspirational content easily.