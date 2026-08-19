# Content platform v2 — migration and rollback runbook

**Applies to:** foundation migration `20260814063853_add_content_platform_v2_foundation` and subsequent v2 rollout  
**Strategy:** expand → shadow → switch → contract  
**Destructive rollback:** prohibited during incident response

## 1. Safety rules

- Never drop/rename v1 tables or columns during expand/shadow rollout.
- Never run heavy backfill inside a schema migration transaction.
- Never enable v2 read path merely because schema deployment succeeded.
- Preserve `Event`, `Insight`, `InsightLocalization`, `UserInsight` and Daily Brief data until post-rollout contract migration is separately approved.
- Take database backup/snapshot according to deployment policy before production migration.
- Use feature flags/worker versions that can operate with dormant additive v2 tables.

Planned flags:

```text
CONTENT_PIPELINE_V1_ENABLED=true
CONTENT_PIPELINE_V2_ENABLED=false
CONTENT_PIPELINE_V2_SHADOW=true|false
CONTENT_FEED_V2_ENABLED=false
CONTENT_COMPAT_PROJECTOR_ENABLED=false
```

Exact flag plumbing is implemented in later runtime tasks; until then all v2 behavior remains off.

## 2. Pre-deploy checklist

- [ ] Working tree/migration reviewed; migration contains no `DROP`, `RENAME`, backfill `INSERT/UPDATE/DELETE` or credential data.
- [ ] `npm run prisma:validate` passes.
- [ ] `npm run prisma:generate` passes.
- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] Required unit/regression/Postman tests pass.
- [ ] Full migration history replays successfully on an empty temporary database.
- [ ] Migration applies successfully to a recent production-like snapshot where available.
- [ ] Backup/snapshot exists and restore procedure is known.
- [ ] V1 scheduler/worker/feed remain enabled; v2 read/write flags are off.
- [ ] Queue workers deployed before any new versioned job is enqueued.
- [ ] On-call owner, observation window and rollback decision maker are identified.

## 3. Foundation migration deployment

```bash
npm run prisma:migrate:deploy
npm run prisma:validate
```

After deploy, verify:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name = '20260814063853_add_content_platform_v2_foundation';

SELECT to_regclass('public.raw_source_payloads'),
       to_regclass('public.canonical_contents'),
       to_regclass('public.content_localizations'),
       to_regclass('public.content_audience_matches');
```

Expected immediately after foundation deploy:

- Migration has `finished_at` and no `rolled_back_at`.
- V2 tables exist and are empty.
- V1 row counts and API behavior are unchanged.
- No v2 jobs are enqueued until compatible runtime is deployed and explicitly enabled.

## 4. Backfill order

Backfill occurs in Day 6 jobs/commands, in bounded cursor batches with dry-run, checkpoints and no long transaction:

1. **Sources/subscriptions audit:** normalize source identities/policies; map legacy interest subscriptions to logical acquisition targets without deleting old rows.
2. **Raw representation:** legacy rows generally have no raw payload. Do not fabricate raw bytes. Set canonical `rawPayloadId=null` and mark compatibility origin; future live fetches populate raw records.
3. **Events → canonical content:** upsert by `(sourceId, externalId)`, then reconcile URL/hash. Preserve title/content allowed by license, publication time, language, publisher and provenance metadata.
4. **Event revision metadata → content revisions:** convert only valid historical snapshots; preserve legacy metadata if conversion is incomplete.
5. **Claims/entities:** deterministic extraction from retained canonical content using a versioned extractor.
6. **InsightEvent groups → clusters:** build/rebuild clusters after canonical records exist; never infer same event solely from title.
7. **InsightLocalization → content localization/revisions:** import only when source hash/locale/quality provenance is sufficient; otherwise enqueue regeneration/review. Never mark fallback-original as verified.
8. **UserInsight → audience match:** preserve user read/dismiss/save state in v1; create v2 candidate identity/matched reason without overwriting v1 state.
9. **Daily Brief:** do not rewrite historical snapshots during foundation backfill. Build v2 briefs only after audience/ranking/feed gates pass.
10. **Reconcile/report:** counts, skipped reasons, conflicts, duplicate rates, source URL health and restart checkpoint.

Each batch records at minimum: job/run ID, cursor, batch size, started/completed time, scanned/created/updated/skipped/rejected counts, policy versions and error codes.

## 5. Shadow rollout sequence

1. Deploy additive schema with every v2 flag off.
2. Deploy workers that understand both legacy and versioned v2 jobs.
3. Enable `CONTENT_PIPELINE_V2_SHADOW=true` while feed continues reading v1.
4. Enable source-centric scheduler for a small source allowlist; verify one fetch per subscription/bucket.
5. Enable normalization/provenance/dedup, then localization, then audience matching in order.
6. Enable compatibility projector only after projection reconciliation tests pass.
7. Compare v1/v2 coverage, freshness, duplicates, localization quality, fallback, cost and queue health.
8. Enable v2 feed read for an allowlisted account only after acceptance gates.

Never skip directly from schema deploy to global v2 feed.

## 6. Application rollback without dropping data

Use this order during an incident:

1. Set `CONTENT_FEED_V2_ENABLED=false` for affected/global scope so reads return to v1.
2. Ensure `CONTENT_PIPELINE_V1_ENABLED=true`.
3. Set `CONTENT_PIPELINE_V2_ENABLED=false` to stop new v2 root work.
4. Set `CONTENT_COMPAT_PROJECTOR_ENABLED=false` if v1 projection is suspected.
5. Disable v2 shadow scheduler if failures create load/cost; otherwise it may remain on only when safe and useful for diagnosis.
6. Let in-flight jobs complete idempotently or fail bounded. Do not purge queues blindly; pause versioned queues/types and inspect state.
7. Verify v1 API/feed/brief, pagination and worker health.
8. Preserve v2 rows, failed jobs and pipeline logs for diagnosis/replay.
9. Record incident time, flag values, last safe pipeline run/cursor and affected source/content IDs.

Rollback success criteria:

- V1 feed and Daily Brief serve successfully.
- No new v2 root jobs are being enqueued.
- V2 queue age/depth is stable or queues are intentionally paused.
- V1 tables/data were not deleted or rewritten by rollback.

## 7. Migration deployed, pipeline v2 disabled

This is a supported steady state, not a failed migration:

- Leave migration marked applied and v2 tables in place.
- Keep v2 read/write/projector flags false; keep v1 enabled.
- Do not run `migrate resolve --rolled-back`, manually edit `_prisma_migrations`, or drop v2 enums/tables.
- Deploy hotfixes against the additive schema; retry v2 using new code/versioned jobs after validation.
- Monitor storage even while disabled. If shadow/raw writes occurred before shutdown, retention jobs must still honor `expires_at` and license policy.
- Prisma Client may include unused v2 models safely; dormant tables do not change API behavior.
- A later migration may add/fix schema. Removing v2 schema requires a separate reviewed contract-phase migration after data retention/export decisions.

## 8. Failed migration handling

### Failure before production migration starts

Fix schema/SQL and regenerate or replace the undeployed migration. Replay the full history on a fresh temporary database.

### Failure during `prisma migrate deploy`

1. Stop application rollout; keep currently compatible v1 version running.
2. Capture Prisma output and inspect `_prisma_migrations.logs` plus PostgreSQL state.
3. Do not rerun blindly and do not manually mark success.
4. Because the foundation SQL is transactional under PostgreSQL unless an operation forces otherwise, confirm whether objects exist and whether Prisma marked failure.
5. Repair using Prisma's documented `migrate resolve` workflow only after exact database state is understood and the repair SQL is reviewed.
6. Validate on a clone/temporary database before production repair.

Do not drop existing v1 objects as a recovery shortcut.

## 9. Roll-forward preference

After additive schema is deployed, prefer application rollback plus a forward corrective migration over reverse DDL. Reverse DDL can destroy raw/canonical/audit data and may fail on dependencies. A corrective migration must remain additive where possible and document data effects.

## 10. Backfill rollback/restart

- Stop the backfill job; keep its cursor/checkpoint.
- Do not delete successfully migrated v2 rows merely to restart.
- Fix mapping/policy, increment job/policy version when output semantics change, then resume/upsert idempotently.
- If bad rows were written, mark/reject them or run a narrowly scoped, audited correction keyed by run ID/content IDs.
- Keep compatibility read on v1 until reconciliation passes.
- A dry-run report must precede every production backfill or correction batch.

## 11. Post-deploy verification checklist

- [ ] Migration recorded as successful.
- [ ] V1 table counts unchanged immediately after foundation deploy.
- [ ] V2 tables empty until explicitly enabled.
- [ ] V1 API, worker and scheduler healthy.
- [ ] No unexpected v2 jobs in queue.
- [ ] No auth header/token/raw credential in logs or metadata.
- [ ] When shadow enabled: fetch count scales by source/subscription, not user.
- [ ] Retry/DLQ/source health visible for failures.
- [ ] Locale fallback explicit; no source text mislabeled as requested locale.
- [ ] Rollback flags tested in non-production and current values recorded.

## 12. Contract-phase removal gate

Legacy pipeline/schema removal is explicitly outside the foundation migration. It requires all of:

- Backfill and reconciliation complete.
- Shadow comparison and scoped rollout meet acceptance thresholds.
- V1 read/write traffic is zero for the agreed observation period.
- User state and historical brief retention are verified.
- Rollback no longer depends on v1 by an approved decision.
- Backup/export and destructive migration plan receive separate review.

Until then, rollback means changing application flags, never dropping data.
