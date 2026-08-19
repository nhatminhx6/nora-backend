# Content platform v2 — database contract

**Status:** Accepted  
**Schema:** `packages/database/prisma/schema.prisma`  
**Foundation migration:** `20260814063853_add_content_platform_v2_foundation`  
**Architecture:** `ADR-001-source-centric-content-platform.md`

## 1. Contract invariants

- V2 tables are additive. `Event`, `Insight`, `InsightLocalization`, `UserInsight` and Daily Brief tables remain available during shadow rollout.
- Acquisition records belong to source/subscription, never to a user.
- Audience records are created only after canonical/provenance/localization gates.
- Source language, presentation locale and market are independent values validated by `@nora/common`.
- Raw and canonical storage obey source license/retention policy.
- Structured numeric/economic values remain typed; model output never overwrites them.
- Reprocessing creates revisions/audit data and does not silently rewrite approved history.

## 2. Table ownership, meaning and retention

| Table                                                          | Owner                       | Meaning                                                                                 | Retention/deletion                                                                                                                       |
| -------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`                                                      | Source registry             | Publisher/provider configuration and adapter identity                                   | Durable while referenced; pause/disable rather than delete                                                                               |
| `source_subscriptions`                                         | Source scheduler            | Logical acquisition target, cursor and schedule state                                   | Durable operational state; obsolete subscriptions are paused/archived by policy                                                          |
| `raw_source_payloads`                                          | Raw ingestion               | Immutable fetched payload or object reference plus HTTP/provenance envelope             | Governed by `retention_policy` and `expires_at`; purge payload bytes/ref only through retention job, preserving permitted audit metadata |
| `canonical_contents`                                           | Canonicalization/provenance | Current normalized projection of one source item                                        | Durable; state changes to rejected/retracted instead of hard deletion when audit/history matters                                         |
| `content_revisions`                                            | Canonicalization            | Immutable previous snapshot before canonical content changes                            | Retain with canonical audit history; cascade only if canonical record is explicitly removed under approved data policy                   |
| `content_claims`                                               | Extraction/validation       | Deterministic/model-assisted claims, entities, numbers, dates, attribution and evidence | Rebuildable by `extraction_version`; retain versions needed by active localization/audit                                                 |
| `content_localizations`                                        | Localization                | One current candidate/result for a reusable localization identity                       | Durable per identity; rejected/failed rows remain inspectable; never overwrite a different identity                                      |
| `content_localization_revisions`                               | Localization quality        | Immutable generation/verification attempts                                              | Audit retention; never delete merely because a later attempt passes                                                                      |
| `content_clusters`                                             | Clustering                  | Versioned same-event grouping and deterministic primary selection                       | Rebuild/archive; do not delete canonical members                                                                                         |
| `content_cluster_members`                                      | Clustering                  | Membership evidence between cluster and canonical content                               | Rebuildable by cluster policy; cascade with cluster/content only under explicit removal                                                  |
| `terminology_entries`                                          | Localization policy         | Versioned source-term → target-locale glossary                                          | Append/version; old versions retained while referenced by localization identity                                                          |
| `content_audience_matches`                                     | Matching/ranking            | User candidate match, explanation and scores                                            | User-owned delivery mapping; expires/hides by status and cascades on user deletion                                                       |
| `events`, `insights`, `insight_localizations`, `user_insights` | Compatibility projector/v1  | Existing app/API projection and user read state                                         | Preserved until contract migration after rollout acceptance                                                                              |
| `pipeline_runs`                                                | Pipeline observability      | Run status/counters/failure metadata                                                    | Operational audit; retention window defined by operations policy, not by content license                                                 |

### Raw retention rules

- `FULL_TEXT`: `payload` or permitted object `payload_ref` may retain full content for the licensed period.
- `EXCERPT_ONLY`: raw representation must exclude unlicensed body text; retain publisher excerpt and required metadata only.
- `METADATA_ONLY`: retain identifiers, URLs, timestamps, hashes and permitted metadata; body must not be persisted.
- Database check `raw_source_payloads_payload_or_ref_check` requires at least one replay representation. For metadata-only sources, `payload_ref` may point to a controlled metadata envelope rather than publisher body.
- Secrets, cookies, Authorization headers and connector credentials are prohibited in payload metadata.

## 3. Identity and idempotency

| Entity                | Unique identity                                                                         | Notes                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Raw payload           | `(source_id, payload_hash)`                                                             | Same bytes from a source create one logical raw record; subscription remains traceable when present                        |
| Canonical content     | `(source_id, external_id)`                                                              | Primary provider identity                                                                                                  |
| Canonical URL         | unique non-null `canonical_url`                                                         | Cross-source exact URL collision resolves to the existing canonical owner or explicit duplicate relation in runtime policy |
| Content revision      | `(canonical_content_id, revision_number)`                                               | Revision number increases monotonically per canonical record                                                               |
| Claim                 | `(canonical_content_id, claim_hash, extraction_version)`                                | Same extraction policy is idempotent                                                                                       |
| Localization          | `(canonical_content_id, locale, source_content_hash, policy_version, glossary_version)` | Full generate-once/reuse-many identity                                                                                     |
| Localization revision | `(content_localization_id, attempt_number)`                                             | Every attempt is preserved in order                                                                                        |
| Cluster               | unique `cluster_key`                                                                    | Key includes/derives from cluster policy version and deterministic event signature                                         |
| Cluster member        | `(cluster_id, canonical_content_id)`                                                    | A content record cannot repeat inside one cluster                                                                          |
| Terminology           | `(source_language, target_locale, normalized_source_term, domain, version)`             | Glossary lookup is version-stable                                                                                          |
| Audience match        | `(user_id, canonical_content_id, locale, policy_version)`                               | Re-running matching policy does not duplicate delivery candidate                                                           |

The database keys are the final idempotency barrier; queue job IDs and service upserts must use equivalent logical identities.

## 4. State machines

### Canonical content

```text
PENDING
  -> READY       only when provenance_status=VERIFIED
  -> REJECTED    deterministic/provenance rejection
  -> FAILED      retryable processing exhausted

READY
  -> READY       new source revision, after ContentRevision snapshot
  -> REJECTED    source becomes invalid
  -> RETRACTED   publisher retracts/correction policy removes publication

FAILED -> PENDING only through bounded retry/replay
REJECTED -> PENDING only after policy/source change with audit reason
RETRACTED is non-publishable; restoration requires an audited new decision
```

Provenance is tracked independently:

```text
PENDING -> VERIFIED | REJECTED | NEEDS_REVIEW
NEEDS_REVIEW -> VERIFIED | REJECTED
VERIFIED -> REJECTED | NEEDS_REVIEW on revalidation
```

`CanonicalContent.status=READY` never overrides a non-verified provenance state at publication time.

### Localization

```text
PENDING -> GENERATING
GENERATING -> VERIFIED | REJECTED | FAILED
FAILED -> GENERATING through bounded retry
REJECTED -> GENERATING only after source/policy/glossary/provider correction
VERIFIED is publishable only while its full identity matches current source hash/policy/glossary
```

Every transition after generation creates a `content_localization_revisions` attempt. A failed/rejected attempt cannot overwrite verified output under another identity.

### Cluster

```text
ACTIVE -> REBUILDING -> ACTIVE
ACTIVE | REBUILDING -> ARCHIVED
ARCHIVED -> REBUILDING only through explicit policy-version rebuild
```

Primary content must be a member of the cluster; runtime enforces this transactionally because the schema FK alone cannot express it.

### Audience match

```text
ACTIVE -> HIDDEN | EXPIRED
HIDDEN -> ACTIVE after an audited rematch/user action policy
EXPIRED -> ACTIVE only by a new policy-version match
```

Only `ACTIVE` matches with publishable locale content can enter feed/brief candidates.

## 5. Write contracts

### Raw persistence

- Compute SHA-256 from original retained bytes/envelope before normalization.
- Upsert by raw identity; do not update immutable payload content on conflict.
- Store final URL/status/content type and redacted metadata.
- Set retention policy from source profile, never from adapter/model output.

### Canonical update

- Resolve source/external identity first, then canonical URL/content hashes.
- Before changing current semantic fields/hash, insert `ContentRevision` in the same transaction.
- Preserve original `publishedAt`; store publisher updates in `updatedAtFromSource`.
- `verifiedAt` records successful provenance verification, not fetch time.
- `originalContent` is nullable to support excerpt/metadata-only licensing.

### Localization publication

- Create/reuse full identity before provider call.
- Record every attempt revision with provider/model/failure codes/evidence.
- Set `VERIFIED` only after deterministic blocking gates and required semantic verification.
- API must not treat `PENDING`, `GENERATING`, `REJECTED` or `FAILED` as requested-locale content.

### Audience matching

- Match only canonical `READY` + provenance `VERIFIED` content or active clusters whose primary/member content satisfies the gate.
- `matched_reason` is machine-readable; API converts it to localized user copy.
- Ranking score is version-bound and can be recomputed without refetch/localization.

## 6. Referential behavior

- Source deletion is restricted while raw/canonical records exist.
- Subscription deletion sets raw `subscription_id` null but preserves source/payload provenance.
- Raw payload deletion sets canonical `raw_payload_id` null; retention-safe canonical metadata remains.
- Canonical deletion cascades revisions, claims, localizations, memberships and audience matches. This is an exceptional administrative/data-policy operation, not routine cleanup.
- Cluster deletion cascades memberships and nulls optional audience cluster reference.
- User deletion cascades v2 audience matches in line with existing user deletion behavior.

## 7. Compatibility mapping contract

Backfill/projector records preserve v1 IDs in v2 metadata until a dedicated mapping table is introduced. Required keys:

```json
{
  "compatibility": {
    "eventId": "uuid",
    "insightIds": ["uuid"],
    "userInsightIds": ["uuid"],
    "projectionVersion": "content-v2-compat-v1"
  }
}
```

- Event maps to canonical by source/external ID, then URL/hash.
- Existing Insight/InsightEvent links may map many events to one cluster; do not merge user state destructively.
- Existing approved localization becomes a v2 localization/revision only when source hash, locale and validation metadata are sufficient; otherwise mark for regeneration/review.
- Compatibility projection is idempotent and is the only component allowed to write v1 delivery projections from v2.

## 8. Database-level limitations handled in services

Prisma/PostgreSQL constraints do not express every invariant. Services must enforce transactionally:

- Cluster primary canonical content is also a member.
- `READY` canonical content has `VERIFIED` provenance.
- Verified localization has non-empty title/summary, `verifiedAt`, acceptable score and no blocking failure code.
- Locale/market strings belong to the central registry and enabled feature set.
- Retention mode and stored payload/body are license-compatible.
- One canonical item is not simultaneously assigned to conflicting active clusters under the same policy version.

Violations use stable error codes and never silently publish.
