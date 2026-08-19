# Content platform v2 — week 1 acceptance report

Date: 2026-08-14  
Internal account: `minhmera@gmail.com`  
Recommendation: **GO for internal account; NO-GO for broad production rollout**

## Delivery status

All 37 tasks in `NEXT_TASKS_7_DAY.md` are complete. The delivered scope covers
architecture and schema, source-centric scheduling, raw evidence, canonical
content, provenance, deduplication, source health, deterministic facts,
clustering, terminology, localization v3 and quality gates, matching/ranking,
feed v2, daily brief, backfill/replay/DLQ/admin operations, metrics, load and
shadow testing, internal rollout, iOS compatibility, and rollback controls.

## Database and rollout

- All 16 Prisma migrations are deployed to the local Nora database.
- Before deployment, a recoverable custom-format backup was written to
  `.local-backups/nora-before-content-v2-20260814.dump` (522 KB).
- Backfill scanned 215 processed events and created 215 canonical records and
  69 localization records with zero skips.
- The target account is configured for locale `vi`, home market `VN`, followed
  markets `GLOBAL/US`, and feed v2.
- 24 verified Vietnamese items were matched and ranked. The service-level feed
  check returned Vietnamese `VERIFIED` content with a valid source URL and a
  terminating pagination state.

## Verification evidence

| Verification | Result |
| --- | --- |
| `prisma validate` / `prisma generate` | Pass |
| TypeScript typecheck | Pass |
| API, worker, scheduler build | Pass |
| Ingestion/unit/failure suite | 77/77 pass |
| Feed v2 suite | 2/2 pass |
| Common contracts | 4/4 pass |
| Work-items regression | 3/3 pass |
| PostgreSQL/Redis integration | Pass on clean 16-migration database |
| Postman contract | Pass; one collection, 37 requests, only `host`/`token` variables |
| iOS build and tests | Pass on iPhone 16e, iOS 26.2; 7/7 tests |
| Rollback drill | Pass; disabled account received `FEED_V2_NOT_ENABLED`, then re-enabled with 24 matches |

The live source probe also exercised fail-closed behavior: a detail URL that
returned HTTP 403 was rejected and did not enter the feed.

## V1/V2 metrics

For the internal account, v1/v2 coverage was 194/24, duplicate rate 0%/0%,
broken URL rate 0%/0%, localization pass rate 12.37%/100%, freshness
approximately 37.1h/37.1h, source diversity 5.15%/4.17%, and modeled source
request units 194/1. The shadow gate returned `GO`.

The 10,000-user CPU model kept source requests at 1, localization calls at 2,
and matching queue depth at 500. V1's modeled source fan-out was 10,000 requests.
See `load-cost-report.md` and `shadow-comparison-report.md` for methodology.

## Cost

The planning placeholder is USD 2 per 1,000 published items. It is not a
provider quote. Actual spend depends on source length, locale count, model,
retry rate, and localization cache hits. V2 removes per-user translation
fan-out by caching per content/locale/policy/glossary version.

## Known issues

- **P1:** The live OpenAI localization provider key is not configured locally.
  Newly fetched non-Vietnamese content cannot complete provider localization
  until credentials and model access are configured.
- **P1:** The v2 worker currently executes `FETCH_SOURCE`; downstream normalize,
  provenance, dedup, localization, match, rank, and brief stages are implemented
  as services/contracts but still need full job-chain wiring before broad rollout.
- **P2:** Verified Vietnamese coverage is 24/194 legacy-linked items and the
  freshest item is about 37 hours old. Internal UI testing is valid, but the
  corpus is not sufficient for general availability.
- **P2:** The source diversity cap leaves four visible items in the current
  internal feed because the verified corpus is concentrated in one publisher.
- **P3:** The synthetic load test measures CPU invariants, not production
  PostgreSQL/provider latency. A multi-hour staging soak is still required.

## Rollback procedure

1. Set `CONTENT_FEED_V2_ENABLED=false` and restart API processes for an immediate
   no-database-write global kill switch.
2. Or run the audited account command with `--enabled=false`; this path was
   verified and returns `FEED_V2_NOT_ENABLED`.
3. Keep v1 ingestion enabled and v2 in shadow mode.
4. Do not roll back additive migrations during an incident. If data restoration
   is required, stop writers and restore the pre-deploy pg_dump into a separate
   database first, validate it, then switch connection configuration.

## Next week

1. Wire the complete v2 BullMQ stage chain and verify restart/resume at every boundary.
2. Configure the approved localization provider and run the 100-fixture golden set against it.
3. Replenish verified Vietnamese coverage and diversify publishers.
4. Run a staging PostgreSQL/Redis/provider soak with queue-age and cost dashboards.
5. Add authenticated API/UI pagination automation and then expand rollout in cohorts.

## Final decision

The internal account may test the iOS UI now. Broad rollout remains blocked by
provider configuration, complete worker orchestration, corpus freshness/coverage,
and staging soak evidence.
