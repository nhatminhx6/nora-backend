# Internal content feed v2 rollout

Target account: `minhmera@gmail.com`

## Enable

```bash
npm run content:rollout -- \
  --user=minhmera@gmail.com \
  --enabled=true \
  --actor=<operator> \
  --reason=<change-ticket>
```

This preserves profile data, sets locale `vi`, home market `VN`, followed
markets `GLOBAL/US`, creates idempotent verified-content matches, ranks them,
and writes an auditable `CONTENT_ROLLOUT` pipeline run.

## Immediate kill switch

Set `CONTENT_FEED_V2_ENABLED=false` and restart the API process. This disables
the endpoint without a database write. Production defaults to disabled when
the variable is absent.

To remove only the account flag through an audited operation:

```bash
npm run content:rollout -- \
  --user=minhmera@gmail.com \
  --enabled=false \
  --actor=<operator> \
  --reason=<incident>
```

## Verification

- `GET /v2/feed?locale=vi&limit=20` returns only `VERIFIED` Vietnamese items.
- Every item has a valid `sourceUrl`; source language and served locale are explicit.
- Duplicate canonical items and duplicate clusters are omitted.
- Follow `nextCursor` until `hasNextPage=false`; an expired cursor returns a bounded error.
- iOS shows localized dates, source metadata, and a fallback marker only when the API
  explicitly reports fallback.
