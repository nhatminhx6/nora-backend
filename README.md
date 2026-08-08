# Nora Backend

## Development authentication

The local `.env` issues access tokens for 60 days and refresh tokens for 90 days.
Existing tokens keep their original embedded expiration, so restart the API and
sign in again after changing these values.

TODO(production): Restore a short access-token lifetime and rotate authentication
secrets before production deployment.

## Real content ingestion

Nora builds each user's brief from their active interests and real RSS articles.
The first source adapter uses Google News RSS, persists deduplicated events, links
each insight to its source, and rebuilds today's daily brief.

Run the API and scheduler in separate terminals during development:

```bash
npm run start:api
npm run start:scheduler
```

The scheduler syncs all users every 10 minutes. To sync the signed-in account
immediately (also available in the Postman collection):

```bash
curl -X POST \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer <access-token>' \
  'http://localhost:3000/v1/ingestion/sync'
```

The iOS app reads only persisted API data. Pull to refresh on the Today screen
after a sync; source names and links are returned with every sourced insight.

## Content locale contract

Localized content endpoints require `locale=vi` or `locale=en` on every call:

```text
GET /v1/briefs/daily?date=2026-08-02&locale=vi
GET /v1/interests/{interestId}/insights?locale=en
```

Missing or unsupported values return `400 INVALID_LOCALE`. Original source
content remains on the event; reusable translations are cached once in
`insight_localizations`. The iOS networking layer appends the currently selected
locale to every API request automatically.

## Development-only APIs

`DELETE /v1/users/account` deletes an account using its registered email without authentication. It exists only to support local development and returns `404 ROUTE_NOT_FOUND` when `NODE_ENV=production`.

`POST /v1/users/onboarding/restart` accepts `{ "email": "user@example.com" }` without authentication and restarts onboarding while preserving the account's interests, insights, and previous daily briefs. It is development-only and disabled in production.

> **TODO before production deployment:** Remove the public email-based account deletion endpoint and replace it with an authenticated, ownership-verified deletion flow.
