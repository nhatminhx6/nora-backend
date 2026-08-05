---
name: nora-curate-data
description: Curate credible, source-linked daily data for Nora and maintain it incrementally across days. Use when Codex needs to ingest, seed, refresh, correct, remove, verify, or troubleshoot Nora events, insights, notifications, or daily briefs; replace demo content with real articles; validate source URLs and provenance; or update Nora's recurring data-acquisition workflow.
---

# Nora Data Curation

Operate on the Nora backend repository and its configured PostgreSQL database. Treat published data as a durable product surface, not disposable seed fixtures.

## Required workflow

1. Resolve the target user, local date, locale, and tracked interests from PostgreSQL. Never infer the user from display text when a JWT subject is available.
2. Read `references/source-policy.md` before selecting or changing sources. Read `references/data-contract.md` before writing events or insights.
3. Inspect existing events for the target date and interests. Continue from stored `externalId`, `contentHash`, `publishedAt`, and provenance metadata instead of recreating everything.
4. Acquire articles from the highest eligible source tier. Prefer official publishers, regulators, company newsrooms, established wire services, and direct RSS/API feeds.
5. Reject homepages, search pages, placeholders, invented URLs, inaccessible URLs, mismatched titles, undated content, and articles outside the freshness window.
6. Run `scripts/verify-source-urls.mjs` on every candidate URL before writing data. A clickable item must resolve to the specific source article with HTTP 2xx.
7. Normalize and upsert by `(sourceId, externalId)`. Preserve the original publication time. Record `canonicalUrl`, `fetchedAt`, `verifiedAt`, `sourceTier`, `publisher`, and content hashes in metadata.
8. On a correction, update the canonical record and append the previous hash, URL, timestamp, and correction reason to `metadata.revisions`. Do not silently rewrite provenance.
9. On invalidation or removal, mark the event `REJECTED`, record `invalidatedAt` and `invalidationReason`, detach it from current briefs, and rebuild affected briefs. Do not hard-delete shared historical events unless explicitly requested.
10. Use `$nora-localize-content` to generate and validate localized insights from verified event text. Never hand-author an unvalidated user-visible translation.
11. Rebuild the target user's daily brief and call the authenticated API exactly as the client does. Require a non-null brief and at least one item.
12. Extract every returned `sourceUrl` and `actionUrl`, run URL verification again, and inspect the response for placeholder domains or missing provenance.
13. Report the target user/date, created/updated/rejected counts, source domains, API result, and quality-gate result. Never finish after only writing the database.

## Continuity rules

- Treat source registry and policy changes as code changes. Update this skill and its references whenever a new failure mode, source type, or correction rule is discovered.
- Prefer incremental upsert over delete-and-reseed.
- Keep development fixtures clearly labeled with `metadata.fixture = true`; never present them as real news.
- Never use `example.com`, fabricated headlines, or generated market claims in user-visible briefs.
- Never log passwords, access tokens, refresh tokens, or raw connector credentials.

## Verification command

Create a JSON file containing candidate objects with `url`, optional `expectedDomain`, and optional `publishedAt`, then run:

```bash
node skills/nora-curate-data/scripts/verify-source-urls.mjs --input /path/to/candidates.json --max-age-days 7
```

Exit code must be zero before publishing. Use `--allow-older` only for explicitly requested historical data.
