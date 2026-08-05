# Nora source policy

## Selection order

1. Tier 1: official APIs, regulator filings, company newsrooms, league/studio/project announcements, original research.
2. Tier 2: Reuters, AP, Bloomberg, Financial Times, established national publishers, and recognized specialist publications with editorial accountability.
3. Tier 3: aggregators only when they link to the original and no primary source is available.

Do not publish user-visible content sourced only from social posts, anonymous blogs, scraped search snippets, Reddit, or AI-generated pages. Social posts may be discovery leads but require independent confirmation.

## URL quality gate

- Require HTTPS and a specific article/detail path.
- Follow redirects and store the final canonical URL.
- Require HTTP 2xx after redirects.
- Reject `example.com`, localhost, URL shorteners, search result pages, consent pages, category homepages, and URLs whose final domain differs unexpectedly.
- Require a publication timestamp or an explicit historical-data exception.
- Require title and content to describe the linked article.

## Freshness

- Daily brief default: published within the previous 48 hours.
- Slow-moving tracked topics: allow up to seven days when no fresher qualifying item exists and label the age.
- Never rewrite `publishedAt` to today merely to make old content look current.

## Corrections and removals

- Content correction: preserve a revision record before updating normalized fields.
- Broken canonical URL: replace only after verifying the publisher's new canonical URL; record the former URL.
- Retracted or false item: mark the event `REJECTED`, store the reason and timestamp, remove it from active briefs, and preserve the audit trail.
- Source quality downgrade: update the registry/policy and re-evaluate affected active items.

## Minimum provenance metadata

```json
{
  "publisher": "Publisher name",
  "canonicalUrl": "https://publisher/article",
  "sourceTier": 1,
  "fetchedAt": "ISO-8601",
  "verifiedAt": "ISO-8601",
  "originalPublishedAt": "ISO-8601",
  "contentHash": "sha256",
  "revisions": []
}
```
