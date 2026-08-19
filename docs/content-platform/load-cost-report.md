# Content platform v2 load and cost report

Date: 2026-08-14

## Scope

This is a deterministic, in-process capacity model for candidate matching and
ranking. It validates scaling invariants; it is not a substitute for a
production database/network soak test. The matrix uses one source item, two
locale/market combinations, a matching batch cap of 500, and 1, 100, 1,000,
and 10,000 simulated users.

## Observed run

| Users | Source requests | Localization calls | Matching ops | Throughput ops/s | p50 ms | p95 ms | p99 ms | Peak queue |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 2 | 1 | 8,351 | 0.1189 | 0.1189 | 0.1189 | 1 |
| 100 | 1 | 2 | 100 | 234,055 | 0.0018 | 0.0158 | 0.0638 | 100 |
| 1,000 | 1 | 2 | 1,000 | 320,496 | 0.0018 | 0.0047 | 0.0110 | 500 |
| 10,000 | 1 | 2 | 10,000 | 755,392 | 0.0010 | 0.0014 | 0.0027 | 500 |

The single-user result includes runtime warm-up, so the larger scenarios are
more representative of CPU-only throughput. Queue depth remains bounded by the
configured batch size.

## Scaling and hotspots

- V1 request fan-out model at 10,000 users: 10,000 source requests.
- V2 source-centric model at 10,000 users: 1 source request, followed by 10,000
  cheap matching operations.
- Localization calls scale with unique content/locale/version, not user count.
- Expected database hotspots are
  `content_audience_matches(user_id,status,ranking_score)`,
  `canonical_contents(provenance_status,published_at)`, and
  `content_localizations(locale,status,verified_at)`. The schema has supporting
  indexes; production telemetry must confirm cache and query-plan behavior.

## Cost assumption

The model uses a planning placeholder of **USD 2 per 1,000 published items**
for translation. This is not a provider quote: actual cost depends on token
volume, selected model, retry rate, locale count, and cache hit rate. The key
v2 saving is that translation is reused per content/locale/version instead of
being repeated per user.

## Decision

The capacity invariants pass for the planned rollout. Proceed to shadow
comparison, while treating real PostgreSQL/Redis/provider soak metrics as a
follow-up before broad production rollout.
