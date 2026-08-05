# Nora curation data contract

## Identity and idempotency

- Resolve the user by JWT `sub`; cross-check email only as a diagnostic.
- Normalize publisher URLs before hashing.
- Use the provider's immutable ID when available. Otherwise hash the canonical URL for `externalId`.
- Upsert events with Prisma's `(sourceId, externalId)` unique key.
- Reuse a verified event across users; create separate `user_insights` for personalization.

## Event rules

- `title`: source-faithful article title, not invented copy.
- `content`: extracted text or publisher-provided description; never fabricate missing details.
- `summary`: nullable until produced from actual content.
- `url`: verified canonical article URL.
- `publishedAt`: publisher timestamp.
- `ingestedAt`: first observation time.
- `processedAt`: successful normalization time.
- `status`: `PROCESSED` only after URL and required-field validation.

## Insight rules

- Link every insight to at least one event through `insight_events`.
- Include Vietnamese and English localization only when each is source-faithful.
- Put personal relevance in `user_insights.matchedReason`; do not alter factual content per user.
- Use `importanceScore` for ranking, not to represent factual confidence.

## Daily brief rules

- Build a brief from verified, non-rejected events.
- Store item snapshots while retaining `userInsightId` linkage.
- Keep article URL in the API response. UI navigation must open a real article or an implemented internal detail route.
- Verify the final authenticated `GET /v1/briefs/daily` response for the exact user, date, and locale.

## Required final audit

- No placeholder domain.
- No null brief when qualifying data exists.
- No item without provenance.
- No URL returning non-2xx.
- No item dated today when its source is older unless explicitly labeled.
- Re-running the workflow creates no duplicate event, insight link, notification, or brief item.
