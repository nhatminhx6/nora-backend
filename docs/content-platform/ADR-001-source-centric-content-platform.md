# ADR-001: Source-centric content platform

- **Status:** Accepted
- **Date:** 2026-08-14
- **Decision owners:** Nora backend
- **Scope:** Content acquisition, normalization, localization, audience matching and compatibility delivery
- **Related:** `docs/content-platform/current-state.md`

## Context

Pipeline hiện tại bắt đầu từ active user, duyệt từng interest, resolve source, fetch feed rồi tạo `UserInsight` ngay trong cùng luồng. Một process-local cache giúp giảm fetch trùng trong một `syncAllUsers`, nhưng subscription vẫn có identity theo interest và cache không bảo vệ giữa process, worker hoặc các lần `syncUser` riêng. Hệ quả là acquisition phụ thuộc audience, khó replay, khó đo chi phí theo source và không bảo đảm one-fetch-per-source-cycle.

Nora cần cung cấp nội dung đa nguồn, đa thị trường và đa ngôn ngữ. Presentation locale của user không được giới hạn ngôn ngữ nguồn hoặc thị trường. Cùng một canonical item và localization phải được tạo một lần, kiểm chứng một lần rồi dùng lại cho mọi user phù hợp.

## Decision

Nora sẽ xây content platform v2 theo kiến trúc **source-centric**, chạy song song với pipeline cũ trong giai đoạn migration:

```text
Source Registry + SourceSubscription due
                  |
                  v
         Fetch once per source/bucket
                  |
                  v
      RawSourcePayload + provenance
                  |
                  v
       Normalize -> CanonicalContent
                  |
                  v
  Validate -> deduplicate -> claim/entity extraction
                  |
                  v
        Cluster content cùng sự kiện
                  |
                  v
 Localize once per reusable identity + quality gate
                  |
                  v
 Audience match -> rank -> compatibility projection
                  |
                  v
             Feed API / Daily Brief
```

Audience không tham gia fetch, raw persistence, canonicalization hoặc localization identity. User interests, market preferences và watch rules chỉ tham gia candidate matching/ranking sau khi content đã qua provenance và quality gates.

## 1. Domain boundaries

### Source acquisition

- `Source` mô tả publisher/provider và policy ổn định.
- `SourceSubscription` mô tả một logical acquisition target: feed, API query hoặc connector cursor; không thuộc user/interest.
- Scheduler query subscription `ACTIVE` đến hạn, claim lease và enqueue deterministic `FETCH_SOURCE` theo subscription + schedule bucket.
- Cùng logical source/subscription/bucket chỉ có một fetch job. Duplicate delivery vẫn phải idempotent ở persistence layer.
- Fetch failure không tạo content fallback và không chặn vô hạn các source khác.

### Raw layer

`RawSourcePayload` giữ bytes/text hoặc external object reference, payload hash, request/final URL, status/content type, fetched time, source/subscription identity, retention policy và redacted metadata. Raw layer là replay boundary; normalize/reprocess không cần refetch khi payload còn hợp lệ.

Raw data không trực tiếp xuất hiện trong feed và không được coi là verified content.

### Canonical layer

`CanonicalContent` là nội dung normalized hiện hành của một source item. Identity ưu tiên `(sourceId, externalId)`, sau đó canonical URL và content fingerprints. Khi cùng identity có content hash mới, tạo `ContentRevision` trước khi cập nhật current projection.

Canonicalization chỉ normalize encoding/whitespace/URL và fields theo adapter contract; không được sáng tác hoặc đổi nghĩa. Provenance gate quyết định `VERIFIED`, `REJECTED` hoặc `NEEDS_REVIEW` trước bước downstream.

### Cluster layer

Dedup xử lý exact/near-exact copies; cluster gom nhiều canonical articles đưa tin cùng sự kiện. Record nguồn không bị xóa. Cluster giữ member relations và chọn primary content deterministic dựa trên source tier, authority, directness, freshness, completeness và provenance warnings.

Feed/Daily Brief trả một card trên cluster khi phù hợp, kèm `sourceCount`; canonical members vẫn truy vết được.

### Localization layer

Localization là asset dùng chung, không phải personalization. Reusable identity chuẩn là:

```text
canonicalContentId
+ targetLocale
+ sourceContentHash
+ policyVersion
+ glossaryVersion
```

Nếu identity không đổi, reuse kết quả đã verified. Mọi generation attempt có revision/audit record; chỉ revision qua quality gate mới được current/publishable. Provider failure hoặc invalid output không ghi đè bản approved trước đó.

### Audience layer

`ContentAudienceMatch` (hoặc compatibility mapping tương đương trong migration) nối canonical content/cluster với user sau ingestion. Matching dựa topic, entity, watch rule, `homeMarket`, `followedMarkets` và global importance. Ranking diễn ra độc lập, versioned và không gọi source adapter.

## 2. Language, locale and market are independent

Các khái niệm được tách rõ:

- `sourceLanguage`: ngôn ngữ của canonical source content, ví dụ `en`.
- `locale`: ngôn ngữ/format trình bày user yêu cầu, ví dụ `vi`.
- `homeMarket`: thị trường chính của user, ví dụ `VN` hoặc `GLOBAL`.
- `followedMarkets`: các thị trường bổ sung, ví dụ `GLOBAL`, `US`.
- `markets`: market relevance của content/source; không suy ra chỉ từ ngôn ngữ.

Ví dụ hợp lệ:

```json
{
  "locale": "vi",
  "homeMarket": "GLOBAL",
  "followedMarkets": ["US"],
  "sourceLanguage": "en"
}
```

Locale chỉ chọn presentation asset. Market chỉ tham gia discovery hints, matching và ranking. Source language chọn translation direction/detection policy. Onboarding có thể đề xuất `vi -> homeMarket=VN`, nhưng user được đổi và runtime không hardcode quan hệ này.

Registry tập trung sẽ phân biệt:

- `SUPPORTED_LOCALES`: bật cho production presentation (`vi`, `en`).
- `KNOWN_LOCALES`: schema/code hiểu nhưng có thể disabled (`vi`, `en`, `zh-Hans`).
- `KNOWN_MARKETS`: typed market values, ban đầu `VN`, `GLOBAL`, `US`, `CN`.

Request strings phải qua normalize/validate; không cast trực tiếp.

## 3. Provenance and storage rights

Mỗi source profile bắt buộc khai báo license/retention policy:

- `FULL_TEXT`: được giữ nội dung đầy đủ theo license/terms.
- `EXCERPT_ONLY`: chỉ giữ publisher excerpt và metadata cần thiết.
- `METADATA_ONLY`: giữ title, identifiers, URL, timestamps, hash/evidence metadata được phép; body nằm ở external reference nếu có.

Không suy đoán quyền lưu từ khả năng kỹ thuật scrape. Nếu policy chưa xác định, source không được mặc định sang `FULL_TEXT`; chọn policy bảo thủ hơn hoặc để `NEEDS_REVIEW`.

Raw/canonical retention áp dụng theo source policy, gồm `expiresAt` hoặc external `payloadRef` khi cần. Log không chứa full payload, Authorization header, token hoặc credential. Evidence/localization chỉ dùng spans được phép retain; nếu license không cho giữ span cần thiết, item không đi qua workflow đòi exact evidence hoặc cần policy riêng đã review.

Thông tin provenance tối thiểu luôn truy vết được: source, subscription/raw reference, external ID, canonical URL, publisher, source language, content hash, fetched time, published time, verified time, source tier và retention basis.

## 4. Locale fallback policy

Không được gắn source-language text dưới nhãn requested locale.

API áp dụng policy explicit:

1. Nếu có publishable localization đúng requested locale: trả nó với `fallback=false`, `servedLocale=requestedLocale`.
2. Nếu chưa có và endpoint/policy là strict: omit item khỏi candidates hoặc trả trạng thái unavailable; không thay text âm thầm.
3. Nếu endpoint cho phép fallback: chỉ trả source-language content khi client contract hỗ trợ và bắt buộc có:

```json
{
  "requestedLocale": "vi",
  "servedLocale": "en",
  "fallback": true,
  "qualityStatus": "SOURCE_FALLBACK"
}
```

Fallback không được ghi thành approved localization và không ngăn retry localization. High-stakes content mặc định strict/omit nếu requested localization chưa verified. Feed v1 compatibility có thể giữ explicit fallback trong shadow period; metrics phải theo dõi fallback rate.

## 5. Structured economic data

Giá, tỷ giá, lãi suất, CPI, phần trăm, index points, timestamps, currency và units được ingest/validate dưới dạng typed values (`Decimal`, currency/unit enums hoặc validated codes). Không gửi structured values qua model để dịch, tính lại hoặc sửa.

Localization chỉ xử lý labels, descriptions và narrative summary. API render value từ typed record theo locale formatting, nhưng value identity không đổi. Nếu narrative chứa số, deterministic preservation gate so sánh với structured source trước publication. Mismatch là blocking error.

## 6. Deterministic code vs model-assisted processing

### Bắt buộc deterministic

- Source scheduling, lease, rate limit, job identity và idempotency.
- Fetch envelope, hashing, redaction, raw persistence và retention enforcement.
- Schema parsing, URL canonicalization rules, timestamps và required-field validation.
- Exact identity/dedup, revision creation và state transitions.
- Extraction/preservation checks cho numbers, currencies, dates, versions, protected entities, direction, negation và attribution markers.
- Localization schema/evidence existence, exact evidence span, glossary/protected-term và fallback checks.
- Typed economic data validation/calculation.
- Feature flags, retry classification, circuit breaker, DLQ và audit logging.

### Model-assisted được phép

- Natural-language localization và source-grounded summary.
- Claim/entity suggestions sau deterministic extraction.
- Semantic equivalence verifier chạy sau blocking deterministic gates.
- Optional similarity signal cho near-duplicate/clustering sau hard constraints về entity/date/number.
- Relevance/importance signals bổ sung cho ranking, nhưng không thay thế provenance gate hoặc deterministic tiebreaker.

Model output luôn untrusted: schema validate, evidence bind, preservation check và quality gate trước persistence/publication. Model không được tạo source URL, sửa structured value, quyết định license, tự nâng provenance status hoặc publish trực tiếp.

## 7. Compatibility with Event/Insight v1

Không drop/rename ngay `Event`, `Insight`, `InsightLocalization`, `UserInsight` hoặc các API fields app hiện đọc.

Trong migration:

- V2 tables là source of truth mới khi feature flag bật; compatibility projector tạo/link v1 `Event`/`Insight` records từ verified canonical/cluster/localization.
- Existing v1 data được backfill idempotent vào canonical tables với original IDs trong mapping/metadata.
- `UserInsight` tiếp tục giữ user read/dismiss/save state và đóng vai trò delivery compatibility; audience matching v2 tạo mapping này sau quality gate.
- `InsightLocalization` tiếp tục là current compatibility projection; v2 localization revisions giữ identity đầy đủ và audit.
- Feed endpoint giữ fields hiện tại, thêm metadata additive hoặc dùng endpoint v2 rõ ràng. Pagination/fallback semantics phải nhất quán.
- Daily Brief chỉ dùng publishable content, không duplicate cluster; v1 snapshots còn đọc được trong rollback.

Không dual-write mù quáng trong nhiều service. Một compatibility projector có idempotent keys chịu trách nhiệm projection và ghi correlation/version để reconcile.

## 8. Migration strategy

Migration theo expand → shadow → switch → contract:

1. **Expand contract:** thêm registry locale/language/market, widen locale columns cần thiết và thêm tables/enums/indexes v2. Không drop/rename tables cũ; không chạy heavy backfill trong migration transaction.
2. **Introduce v2 disabled:** deploy code hiểu v1 + versioned v2 jobs với `CONTENT_PIPELINE_V2_ENABLED=false`, v1 vẫn on.
3. **Shadow ingestion:** scheduler v2 fetch due subscriptions, persist raw/canonical/localization/audience results nhưng feed vẫn đọc v1. Compatibility projection có thể chạy shadow/reconcile.
4. **Backfill:** batch, cursor-based, idempotent và resumable từ Event/Insight/localizations cũ. Preserve IDs/hashes/timestamps/provenance; không overwrite canonical record chất lượng cao hơn.
5. **Compare:** đo coverage, freshness, duplicate rate, source URL health, localization quality/fallback, request count, cost và pagination compatibility.
6. **Scoped read switch:** bật feed v2 theo account/feature flag; v1 write/read vẫn sẵn sàng.
7. **Broaden rollout:** chỉ tăng traffic khi acceptance gates đạt; mọi stage có kill switch.
8. **Contract later:** chỉ cân nhắc xóa pipeline/schema cũ ở migration riêng sau thời gian ổn định và audit backfill; không thuộc tuần này.

Migrations dùng additive DDL, indexes phù hợp và deploy-safe ordering. Backfill/replay là job/command riêng, có dry-run/checkpoint, không giữ transaction dài.

## 9. Rollback strategy

Rollback ứng dụng không yêu cầu rollback/drop database:

1. Tắt `CONTENT_PIPELINE_V2_ENABLED` và v2 read flag; giữ hoặc tắt shadow độc lập.
2. Bật/giữ `CONTENT_PIPELINE_V1_ENABLED=true`.
3. Dừng enqueue v2 root jobs; worker đã nhận job phải kết thúc idempotent hoặc fail bounded, không publish partial content.
4. Feed/Daily Brief quay về v1 tables/projections. V1 data không bị xóa trong expand/shadow phases.
5. Giữ nguyên raw/canonical/v2 data để điều tra/replay; không drop tables khi rollback incident.
6. Nếu compatibility projection gây lỗi, disable projector riêng và reconcile từ correlation/checkpoint sau khi fix.
7. Migration đã deploy nhưng v2 off được xem là dormant additive schema; cleanup chỉ qua migration được review sau.

Rollback trigger gồm: broken URL/duplicate/fallback regression, blocking localization defect lọt qua, queue age không ổn định, feed coverage giảm dưới gate hoặc API/pagination incompatibility.

## 10. `zh-Hans` extension point

`zh-Hans` được đưa vào `KNOWN_LOCALES`, BCP-47 normalization (`zh-CN`/`zh-SG` khi policy cho phép) và schema width, nhưng không nằm trong `SUPPORTED_LOCALES` production tuần này.

Mọi localization provider, glossary, evaluator, source policy và UI support phải capability-check locale thay vì assume two-language array. Feature flag mặc định off; parser trả known-but-disabled error thay vì silently map sang `en`/`vi`. Không enqueue production localization `zh-Hans` cho đến khi có glossary, golden dataset, semantic evaluator và rollout gate riêng.

## 11. Operational invariants

- Fetch volume phụ thuộc source/subscription/bucket, không phụ thuộc user count.
- Localization calls phụ thuộc unique reusable identity, không phụ thuộc matched user count.
- Mọi downstream job mang version, correlation ID, pipeline run ID và relevant source/content identity.
- Duplicate delivery tạo tối đa một logical output.
- Validation reject không retry vĩnh viễn; retryable network/provider errors bounded và tôn trọng `Retry-After`.
- Source/provider failure không tạo loading vô hạn; queue/DLQ/source health quan sát được.
- Content chỉ publish khi provenance và locale quality state cho phép.

## 12. Consequences

### Positive

- Network và localization cost scale theo sources/content thay vì users.
- Cross-language feed trở thành default capability mà không trộn locale với market.
- Raw replay, revision audit, dedup/cluster và failure recovery trở nên khả thi.
- Quality/provenance gates có boundary rõ và đo được.
- Pipeline v1/app hiện tại có đường migration/rollback an toàn.

### Costs and trade-offs

- Tăng số tables, states, queue jobs và operational metrics.
- Cần compatibility projector/backfill và thời gian dual-run.
- Raw retention/licensing làm source onboarding chặt hơn.
- Clustering/localization quality có eventual consistency; strict locale feed có thể tạm ít item hơn thay vì fallback sai nhãn.
- Additive schema tạm dùng thêm storage cho v1 + v2.

## 13. Rejected alternatives

### A. Giữ user-centric ingestion và chỉ thêm cache Redis

Loại vì cache chỉ giảm request, không tách ownership/subscription, không tạo raw replay boundary và vẫn để acquisition/matching scale/couple theo user interests. Cache miss/race không bảo đảm one-fetch-per-cycle.

### B. Tạo source/subscription riêng cho mỗi user hoặc interest

Loại vì logical source bị nhân bản, khó rate-limit/health/cursor nhất quán và fetch volume tăng theo user count.

### C. Dùng locale để chọn source và suy ra market

Loại vì user `vi` phải nhận được content `en` đã localize và có thể chọn `homeMarket=GLOBAL`; language, presentation và geography là ba chiều độc lập.

### D. Dịch riêng cho từng user

Loại vì factual output không nên khác theo user, chi phí tăng tuyến tính và khó audit. Personal relevance thuộc audience match/presentation metadata, không thuộc localization asset.

### E. Localize trước dedup/cluster

Loại vì tạo nhiều bản dịch cho copies/cùng sự kiện, tăng chi phí và nguy cơ inconsistency. Exact/near dedup phải trước localization; cluster có thể chọn primary trước card generation.

### F. Dùng LLM cho toàn bộ normalize, validate và economic values

Loại vì không deterministic/idempotent, có nguy cơ đổi số/entity/direction, khó replay và không phù hợp provenance/licensing decisions.

### G. Ghi đè schema/pipeline v1 ngay (big-bang migration)

Loại vì app/API hiện phụ thuộc Event/Insight/UserInsight, không có rollback an toàn và chưa có shadow metrics/backfill proof.

### H. Luôn fallback source language khi localization lỗi

Loại vì gây locale-label leak và che khuất quality/provider failures. Fallback chỉ được phép explicit theo endpoint policy; strict/high-stakes content bị omit.

### I. Chỉ lưu canonical normalized content, không lưu raw payload

Loại vì parser/provenance policy changes buộc refetch, khó điều tra source defects và không replay deterministic. Raw retention vẫn bị giới hạn bởi license/policy.

### J. Lưu full text cho mọi source vì URL public

Loại vì khả năng truy cập không đồng nghĩa quyền lưu/tái sử dụng. Source profile phải có explicit retention/license policy.

## 14. Follow-up implementation

Các quyết định trong ADR này được triển khai tuần tự bởi registry contract, additive Prisma schema/database runbook, source registry/job v2, raw persistence, canonical/provenance/dedup, localization quality, audience matching, compatibility API, backfill/operations và shadow acceptance tasks trong `NEXT_TASKS_7_DAY.md`.

Không có quyết định bắt buộc nào trong ADR này để ở trạng thái TBD. Threshold/weight vận hành có thể version/configure trong task tương ứng nhưng không thay đổi các invariants nêu trên.
