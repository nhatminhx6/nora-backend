# Content platform v1 — current-state baseline

**Ngày khảo sát:** 2026-08-14  
**Phạm vi:** ingestion, worker, scheduler, content API, interests, Prisma schema và các skill curation/localization.  
**Nguyên tắc:** chỉ quan sát code/database; không sửa runtime và không chạy network ingestion làm đổi dữ liệu dùng chung.

## 1. Tóm tắt

Pipeline hiện tại đã có các nền móng tốt: source/subscription có identity riêng, event có URL/hash/provenance metadata, insight được dùng chung qua `UserInsight`, localization có revision identity, queue có deterministic job ID và API trả metadata fallback. Tuy nhiên orchestration vẫn bắt đầu từ user và interest. Subscription mang identity `interest:<interestId>`, matching diễn ra ngay trong fetch/persist, và source profile dùng `locale` để biểu diễn ngôn ngữ nguồn.

`syncAllUsers` cache theo feed URL trong đúng một process/run nên hiện fetch mỗi feed RSS tối đa một lần cho lượt đó. Đây chưa phải source-centric scheduling: `syncUser` tạo cache mới, nhiều worker không chia sẻ cache, scheduler không claim subscription đến hạn, và số subscription vẫn tăng theo interest của user.

## 2. Data flow hiện tại

```text
Scheduler mỗi 10 phút
  -> enqueue sync-all theo bucket
  -> Worker -> IngestionService.syncAllUsers()
     -> query active users có active interest
     -> tạo Map<feedUrl, normalizedItems> cho đúng run
     -> từng user -> từng interest
        -> topicKey -> sourceProfile
        -> upsert Source
        -> upsert SourceSubscription key interest:<interestId>
        -> fetch/parse RSS nếu feed chưa có trong Map
        -> lọc item bằng terms của interest
        -> HTTP verify article + extract content
        -> upsert/update Event
        -> create/reuse Insight + InsightEvent
        -> upsert UserInsight ngay cho user/interest
        -> enqueue localization vi và en
     -> rebuild DailyBrief từng user
     -> ghi PipelineRun tổng hợp

Localization worker
  -> load Insight + verified Event
  -> translate title/summary -> deterministic quality validation
  -> upsert InsightLocalizationRevision
  -> nếu pass: upsert InsightLocalization hiện hành
  -> rebuild brief cho các user đã match

Feed API
  -> UserInsight -> Insight -> requested localization + Event
  -> localization nếu có, nếu không source-language Insight
  -> requestedLocale + servedLocale + fallback
```

Điểm vào scheduler: `apps/scheduler/src/ingestion.job.ts:11-14`; worker dispatch: `apps/worker/src/ingestion.worker.ts:39-58`. Vòng user/interest, cache và fetch: `packages/modules/ingestion/src/ingestion.service.ts:60-180`. Persist/match/localize: `packages/modules/ingestion/src/ingestion.service.ts:238-372` và `512-523`. API fallback: `packages/modules/content/src/content.service.ts:143-252` và `307-359`.

## 3. Coupling user → interest → source fetch

1. `syncAllUsers` query user trước rồi gọi `syncUserWithCache` tuần tự (`ingestion.service.ts:165-188`).
2. `syncUserWithCache` query interest theo `userId`, resolve profile trong vòng interest (`60-77`).
3. Subscription key là `interest:<interestId>` và config lưu `interestId` (`78-97`); hai user theo cùng topic tạo hai subscription.
4. Search terms lấy từ interest và lọc trước persistence (`71-75`, `110-116`, `856-883`), khiến canonical corpus phụ thuộc audience hiện có.
5. `persistItem` nhận bắt buộc `userId`/`interestId` và tạo `UserInsight` cùng operation Event/Insight (`238-244`, `300-372`).
6. `syncUser()` tạo `new Map()` riêng (`54-58`), nên fetch lại nguồn giữa các calls.
7. Cache của `syncAllUsers` chỉ là process-local Map (`177-180`), không có lease/bucket dùng chung.
8. `sourceProfile(topicKey)` và fallback slug theo topic (`source-profile.ts:53-65`) gắn source discovery với interest taxonomy.

## 4. Locale/language contract rải rác

| File | Lines | Vai trò |
|---|---:|---|
| `packages/modules/interests/src/topic-catalog.ts` | 3, 5-28, 138-140 | `SupportedLocale`, labels, parser fallback `vi` |
| `packages/modules/ingestion/src/source-profile.ts` | 8, 31, 49, 63 | `locale` thực tế là source language |
| `packages/modules/ingestion/src/source-adapter.ts` | 12 | normalized item language |
| `packages/modules/ingestion/src/rss-source.adapter.ts` | 116-120 | detector trả `vi/en` |
| `packages/modules/ingestion/src/ingestion.queue.ts` | 14, 67 | localization job locale |
| `packages/modules/ingestion/src/ingestion.service.ts` | 23, 469, 515, 528, 697 | generation/enqueue locale |
| `packages/modules/ingestion/src/translation-provider.ts` | 1 | `TranslationLocale` |
| `packages/modules/ingestion/src/localization-quality.validator.ts` | 8-9 | source/target locale |
| `packages/modules/content/src/content.service.ts` | 307, 383-390 | feed mapping/API parser |

Schema lưu `User.locale`, `Event.language`, `Insight.language`, localization locale và pipeline locale bằng `String` (`schema.prisma:72,466,508,531,557,586`). Localization columns là `VarChar(2)`, chưa chứa được `zh-Hans`. Chưa có typed `market`, `homeMarket`, `followedMarkets` hoặc registry chung.

## 5. Model và unique key có thể tái sử dụng

| Model | Identity/index hiện tại | Có thể dùng cho v2 | Hạn chế |
|---|---|---|---|
| `Source` | unique slug; status/kind và adapter indexes (`schema.prisma:405-425`) | registry, adapter/config/credential ref | thiếu language, markets, tier, authority, license policy typed |
| `SourceSubscription` | unique source/key; due index (`428-451`) | scheduler/cursor/health | key mang interest; chưa lease/claim |
| `Event` | unique source/externalId, unique URL, hash/time indexes (`454-485`) | compatibility canonical record, exact dedup | revision trong JSON; không raw payload |
| `Entity` + joins | unique type/key và composite PKs (`368-403`, `488-500`, `612-622`) | extraction/matching | chưa claim/evidence relation |
| `Insight` / `InsightEvent` | composite insight/event PK (`503-525`, `600-610`) | compatibility aggregate/multi-source link | runtime thường 1:1, chưa cluster policy |
| `InsightLocalization` | unique insight/locale (`528-552`) | current publishable compatibility | identity hiện hành thiếu versions |
| `InsightLocalizationRevision` | unique insight/locale/hash/prompt (`554-577`) | reusable identity/audit | thiếu policy/glossary version; locale width 2 |
| `UserInsight` | unique user/insight/interest (`625-646`) | compatibility audience/read state | matching coupled ingestion |
| `PipelineRun` | pipeline/status/time và error indexes (`580-598`) | observability/audit | chưa root/child/correlation/job linkage |
| `DailyBrief` | unique user/date (`704-723`) | delivery compatibility | rebuild delete/recreate items |
| Economic indicator models | typed Decimal; unique indicator/time (`91-127`) | structured-value foundation | chưa nối content pipeline |

## 6. Baseline định lượng

### Database snapshot

PostgreSQL local healthy ngày 2026-08-14; không reseed/network sync:

| Record | Count |
|---|---:|
| Users | 3 |
| Active interests | 15 |
| Sources | 16 |
| Source subscriptions | 12 |
| Events | 215 |
| Insights | 215 |
| Insight localizations | 69 |
| User insights | 218 |

Exact duplicate audit:

- URL: 215 distinct / 215 non-null events → **0 duplicate rows (0%)**.
- Content hash: 215 distinct / 215 events → **0 duplicate rows (0%)**.
- Current localization identity `(insightId, locale)`: 69 distinct / 69 → **0 duplicate rows (0%)**.

Code chưa có normalized fingerprint/near-duplicate/cluster, nên chưa đo được các bài khác URL/hash nhưng cùng sự kiện.

### Request count cho một `syncAllUsers`

15 active interests hiện resolve thành 9 unique feeds: `apple`, `bitcoin`, `openai`, `markets`, `technology`, `travel`, `career`, `health`, `sports`. Với Map cache hiện tại, một invocation hoàn tất trong một process gọi **9 RSS feed fetches**. Nếu không cache, traversal là 15; các `syncUser` riêng không reuse cache giữa calls.

Số 9 chỉ tính request lấy feed. Adapter còn tối đa một HTTP detail verification cho mỗi normalized item chưa verified (`rss-source.adapter.ts:65-113`), nên tổng HTTP requests phụ thuộc feed entries và chưa được instrument.

### Created-count theo run

Không thể truy ngược chính xác Event/Insight/Localization **được tạo bởi một run lịch sử**:

- Source `PipelineRun.processedCount` chỉ cộng `eventCreated`, không lưu insight/localization-created (`ingestion.service.ts:175-199`).
- Các record không có `pipelineRunId`; localization chạy async ở job khác.
- Seed và nhiều lần sync cùng nằm trong aggregate tables.

Snapshot hiện là **215 Event, 215 Insight, 69 current Localization**. Để đo per-run cần correlation/run relations hoặc before/after instrumentation; đó là runtime work ngoài D1-T01.

## 7. Rủi ro migration và compatibility

1. Subscription source-centric phải map/dedupe các key `interest:<id>` cũ, không đổi tại chỗ.
2. Feed/Daily Brief phụ thuộc `UserInsight -> Insight -> InsightEvent -> Event`; v2 cần compatibility links trước khi app đọc bảng mới.
3. `Event.url` unique toàn DB có thể conflict ở syndication/canonical URL changes.
4. Revision Event trong JSON; update hiện ghi lại `publishedAt` (`ingestion.service.ts:375-429`). Cần revision table và preserve history.
5. `VarChar(2)` không chứa `zh-Hans`; parser interests silently default `vi`, trong khi content API reject unknown/missing locale.
6. API explicit fallback metadata nhưng vẫn trả source-language text khi localization thiếu (`content.service.ts:314-355`); policy v2 phải giữ contract rõ ràng.
7. Localization revision key thiếu policy/glossary versions; migration phải giữ approved current row và revisions.
8. Không có raw payload nên parser/provenance không replay được nếu không refetch; retention/license phải chốt trước raw/full-text storage.
9. Process-local cache không ngăn duplicate network/validation calls giữa workers; DB unique keys chỉ ngăn một phần duplicate record.
10. Catch theo interest chỉ log warning, không update health counters (`ingestion.service.ts:154-158`).
11. Rolling deploy cần worker hiểu job cũ và v2 versioned jobs đồng thời.
12. Adapter extract full article (`rss-source.adapter.ts:80-103`) nhưng profile chưa có license/retention policy.
13. Seed có development records/query-like URLs (`seed.ts:499-635`); metrics phải tách `developmentSeed` khỏi content production-like.
14. Brief rebuild delete/recreate items (`ingestion.service.ts:791-824`), dễ churn khi v1/v2 shadow cùng chạy.

## 8. Compatibility boundaries đề xuất

- Giữ `Event`, `Insight`, `InsightLocalization`, `UserInsight` và API fields trong shadow phase.
- Thêm raw/canonical/localization v2 tables và mapping theo hướng additive; không rename/drop model cũ.
- Scheduler mới claim due subscription; matching tạo compatibility `UserInsight` sau canonical/localization quality gate.
- Dùng feature flags v1/v2/shadow và deterministic job identity; không dựa process-local cache để đảm bảo one-fetch-per-cycle.
- Tập trung locale/language/market contract và widen locale columns trước extension `zh-Hans` (feature vẫn off).
- Thêm run/correlation linkage để baseline sau đo fetch, accepted, deduped, localized và matched theo run.

## 9. Verify

```bash
git status --short --branch
docker compose ps --format json
docker compose exec -T postgres psql -U nora -d nora ...
npm run typecheck
npm run test:prepare-data
```

Kết quả test cuối cùng được ghi trong task tracker và nhật ký bàn giao.
