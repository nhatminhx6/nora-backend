export { IngestionModule } from './ingestion.module';
export {
  INGESTION_QUEUE,
  IngestionJobData,
  IngestionQueue,
  NoraIngestionJobData,
  redisConnection,
} from './ingestion.queue';
export { IngestionService } from './ingestion.service';
export {
  CanonicalContentService,
  normalizeCanonicalCandidate,
  normalizeSemanticText,
  semanticContentHash,
} from './canonical-content.service';
export type { CanonicalPersistResult } from './canonical-content.service';
export {
  ProvenanceValidatorService,
  contentMatchesDetail,
  languageConfidence,
  samePublisherDomain,
} from './provenance-validator.service';
export type { ProvenanceValidationResult } from './provenance-validator.service';
export {
  ContentDeduplicationService,
  classifyDuplicate,
  isLocalizationEligible,
  normalizedFingerprint,
} from './content-deduplication.service';
export type { DuplicateDecision, DuplicateKind } from './content-deduplication.service';
export { SourceHealthService, parseMetrics, sourceIsStale } from './source-health.service';
export {
  DETERMINISTIC_EXTRACTION_VERSION,
  DeterministicClaimExtractorService,
  extractDirections,
  extractEntities,
  extractFacts,
} from './deterministic-claim-extractor.service';
export type {
  DeterministicExtraction,
  ExtractedClaim,
  ExtractedFact,
  FactKind,
} from './deterministic-claim-extractor.service';
export {
  CLUSTER_POLICY_V1,
  ContentClusteringService,
  clusterFeatures,
  primaryContentScore,
} from './content-clustering.service';
export {
  TerminologyGlossaryService,
  deterministicEntries,
  normalizeTerminologyTerm,
} from './terminology-glossary.service';
export type { ResolvedTerminology } from './terminology-glossary.service';
export { TERMINOLOGY_SEED_V1 } from './terminology-seed';
export type { TerminologySeedEntry } from './terminology-seed';
export {
  LOCALIZATION_POLICY_V3,
  LOCALIZATION_V3_JSON_SCHEMA,
  LOCALIZATION_V3_PROVIDER,
  parseLocalizationV3Output,
} from './localization-v3.contract';
export type {
  LocalizationV3Claim,
  LocalizationV3Output,
  LocalizationV3Provider,
  LocalizationV3ProviderResult,
  LocalizationV3Request,
} from './localization-v3.contract';
export { LocalizationV3Service } from './localization-v3.service';
export {
  LOCALIZATION_BLOCKING_ERRORS,
  LOCALIZATION_QUALITY_POLICY_V3,
  LOCALIZATION_SEMANTIC_VERIFIER,
} from './localization-quality-v3.contract';
export type {
  LocalizationBlockingError,
  LocalizationQualityV3Input,
  LocalizationSemanticVerifier,
  SemanticVerificationRequest,
  SemanticVerificationResult,
} from './localization-quality-v3.contract';
export { LocalizationQualityV3Validator } from './localization-quality-v3.validator';
export { LocalizationQualityV3Service } from './localization-quality-v3.service';
export {
  CandidateMatchingService,
  MATCHING_POLICY_V1,
  candidateReasons,
  isCandidate,
} from './candidate-matching.service';
export type { MatchedReasonV1 } from './candidate-matching.service';
export {
  ContentRankingService,
  RANKING_POLICY_V1,
  RANKING_WEIGHTS_V1,
  diversifiedRanking,
  rankingScore,
} from './content-ranking.service';
export type { RankingBreakdownV1 } from './content-ranking.service';
export {
  DAILY_BRIEF_POLICY_V2,
  DailyBriefV2Service,
  briefInputVersion,
} from './daily-brief-v2.service';
export { LegacyContentBackfillService, parseBackfillArgs } from './legacy-content-backfill.service';
export type { BackfillOptions, BackfillReport } from './legacy-content-backfill.service';
export { RawPayloadReplayService, parseReplayArgs } from './raw-payload-replay.service';
export type { ReplayOptions } from './raw-payload-replay.service';
export { DeadLetterService, parseDlqArgs } from './dead-letter.service';
export type { DlqFilter } from './dead-letter.service';
export { ContentMetricsService, contentAlerts } from './content-metrics.service';
export type { ContentAlert } from './content-metrics.service';
export { ContentOperationsService, pipelineEnv } from './content-operations.service';
export type { ContentOperation } from './content-operations.service';
export {
  ContentPipelineTelemetryService,
  sanitizeLogMetadata,
  stableContentErrorCode,
} from './content-pipeline-telemetry.service';
export {
  RawSourcePayloadService,
  SourceFetchError,
  fetchSourceEnvelope,
  safeResponseHeaders,
} from './raw-source-payload.service';
export type { SourceFetchEnvelope } from './raw-source-payload.service';
export { RssSourceV2Adapter, rawEnvelopeFixture } from './rss-source-v2.adapter';
export type {
  CanonicalCandidate,
  FetchInputV2,
  ProvenanceResult,
  RawEvidenceReference,
  RawPayloadEnvelope,
  SourceAdapterV2,
} from './source-adapter';
export {
  SourceSchedulerService,
  isPipelineFlagEnabled,
  nextSourceSyncAt,
  scheduleBucket,
} from './source-scheduler.service';
export {
  CONTENT_JOB_POLICIES,
  CONTENT_JOB_TYPES,
  CONTENT_JOB_VERSION,
  assertContentJobData,
  contentBackoffStrategy,
  contentJobId,
  contentJobLogMetadata,
  contentJobOptions,
  isContentJobData,
  retryDecision,
  sanitizeJobId,
} from './content-job';
export type {
  ContentJobData,
  ContentJobFailure,
  ContentJobPolicy,
  ContentJobType,
  RetryDecision,
} from './content-job';
export type { SourceProfile, SourceSelectionPolicy } from './source-profile';
export {
  SOURCE_PROFILES,
  sourceProfile,
  sourceProfileBySlug,
  sourceProfilesForTopic,
} from './source-registry';
export { compareShadowFeeds } from './shadow-comparison.service';
export type {
  ShadowComparisonReport,
  ShadowFeedItem,
  ShadowMetrics,
} from './shadow-comparison.service';
export {
  CONTENT_FEED_V2_FLAG,
  ContentRolloutService,
  accountFeedV2Enabled,
  globalFeedV2Enabled,
} from './content-rollout.service';
