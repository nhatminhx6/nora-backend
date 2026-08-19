# V1/V2 shadow comparison

Date: 2026-08-14  
Account: `minhmera@gmail.com`  
Decision: **GO for internal rollout**

The comparison uses the same legacy event identities after idempotent v2
backfill. V2 eligibility mirrors the feed gate: verified provenance, canonical
content, and a verified Vietnamese localization.

| Metric | V1 | V2 |
| --- | ---: | ---: |
| Coverage | 194 | 24 |
| Freshest item age | 37.08 h | 37.08 h |
| Duplicate rate | 0% | 0% |
| Broken URL rate | 0% | 0% |
| Localization pass rate | 12.37% | 100% |
| Mean relevance/authority signal | 0.9591 | 0.5000 |
| Source diversity | 5.15% | 4.17% |
| Source/request units | 194 | 1 |

## Gate result

- Broken URL rate did not increase.
- Duplicate rate did not increase.
- No blocking localization error is eligible for the v2 feed.
- Vietnamese coverage is 24 items, above the internal minimum of 10.
- Every v2 item has a stable UUID for cursor pagination.

V2 intentionally has lower coverage because it fails closed: 170 legacy items
without a verified Vietnamese localization are omitted. The internal rollout
may proceed; broad rollout remains gated on replenishing fresh verified content
and observing provider/queue metrics through a full ingestion cycle.
