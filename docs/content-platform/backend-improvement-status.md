# Backend improvement implementation status

Date: 2026-08-16

## Implemented

- Mobile/API read paths cannot trigger ingestion; `POST /ingestion/sync` was removed.
- Prepared content is classified with catalog topic keys before users select it.
- `GET /interests/catalog?locale=vi` exposes only selectable topics with inventory:
  available item count, fresh item count, latest publication time, and publisher count.
- A topic is selectable only when it has at least five verified items and at least one
  item published during the last seven days.
- `PUT /v2/users/me/topics` atomically replaces topic selection and matches/ranks
  already-published content.
- Matching queries only selected topics and incrementally expires/rematches changed topics.
- A GIN index supports canonical-content topic filtering.
- Feed cursors bind both ranking score and match ID, so a changed ranking expires an old cursor.
- iOS onboarding and Profile submit one bulk selection request; Today performs read-only feed calls.

## Local acceptance evidence

- Prepared Vietnamese inventory: technology 16 items, markets 8 items.
- First bulk selection transaction: 20.1 ms for 24 matches.
- Repeating an unchanged selection: 6.9 ms with no rematch writes.
- Internal feed remains available immediately after selection.
- Backend build/typecheck and Postman contract pass; iOS build and 7 tests pass.

## Deferred by product sequencing

The periodic cron/worker refresh is intentionally next. Its required chain is:

`FETCH_SOURCE → NORMALIZE_PAYLOAD → VALIDATE_CONTENT → DEDUPLICATE → CLASSIFY_TOPIC → LOCALIZE_CONTENT → PUBLISH_CONTENT → MATCH_USERS → BUILD_BRIEFS`

Before enabling it, raw-payload retention and normalization hand-off must be reconciled:
metadata-only sources currently do not retain a body for the asynchronous normalize job.
The solution must preserve licensing policy while keeping restart-safe job boundaries.
