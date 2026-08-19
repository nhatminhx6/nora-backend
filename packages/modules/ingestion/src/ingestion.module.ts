import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nora/database';
import { IngestionService } from './ingestion.service';
import { IngestionQueue } from './ingestion.queue';
import { RssSourceAdapter } from './rss-source.adapter';
import { ArticleContentExtractor } from './article-content.extractor';
import { MyMemoryTranslationProvider } from './mymemory-translation.provider';
import { TRANSLATION_PROVIDER } from './translation-provider';
import { OpenAiTranslationProvider } from './openai-translation.provider';
import { LocalizationQualityValidator } from './localization-quality.validator';
import { ConfigService } from '@nestjs/config';
import { SourceSchedulerService } from './source-scheduler.service';
import { RawSourcePayloadService } from './raw-source-payload.service';
import { ContentPipelineTelemetryService } from './content-pipeline-telemetry.service';
import { RssSourceV2Adapter } from './rss-source-v2.adapter';
import { CanonicalContentService } from './canonical-content.service';
import { ProvenanceValidatorService } from './provenance-validator.service';
import { ContentDeduplicationService } from './content-deduplication.service';
import { SourceHealthService } from './source-health.service';
import { DeterministicClaimExtractorService } from './deterministic-claim-extractor.service';
import { ContentClusteringService } from './content-clustering.service';
import { TerminologyGlossaryService } from './terminology-glossary.service';
import { LocalizationV3Service } from './localization-v3.service';
import { LOCALIZATION_V3_PROVIDER } from './localization-v3.contract';
import { OpenAiLocalizationV3Provider } from './openai-localization-v3.provider';
import { LocalizationQualityV3Validator } from './localization-quality-v3.validator';
import { LocalizationQualityV3Service } from './localization-quality-v3.service';
import { LOCALIZATION_SEMANTIC_VERIFIER } from './localization-quality-v3.contract';
import { OpenAiLocalizationSemanticVerifier } from './openai-localization-semantic-verifier';
import { CandidateMatchingService } from './candidate-matching.service';
import { ContentRankingService } from './content-ranking.service';
import { DailyBriefV2Service } from './daily-brief-v2.service';
import { LegacyContentBackfillService } from './legacy-content-backfill.service';
import { RawPayloadReplayService } from './raw-payload-replay.service';
import { DeadLetterService } from './dead-letter.service';
import { ContentMetricsService } from './content-metrics.service';
import { ContentOperationsService } from './content-operations.service';
import { ContentRolloutService } from './content-rollout.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    IngestionService,
    IngestionQueue,
    RssSourceAdapter,
    ArticleContentExtractor,
    MyMemoryTranslationProvider,
    OpenAiTranslationProvider,
    LocalizationQualityValidator,
    SourceSchedulerService,
    RawSourcePayloadService,
    ContentPipelineTelemetryService,
    RssSourceV2Adapter,
    CanonicalContentService,
    ProvenanceValidatorService,
    ContentDeduplicationService,
    SourceHealthService,
    DeterministicClaimExtractorService,
    ContentClusteringService,
    TerminologyGlossaryService,
    LocalizationV3Service,
    OpenAiLocalizationV3Provider,
    LocalizationQualityV3Validator,
    LocalizationQualityV3Service,
    OpenAiLocalizationSemanticVerifier,
    CandidateMatchingService,
    ContentRankingService,
    DailyBriefV2Service,
    LegacyContentBackfillService,
    RawPayloadReplayService,
    DeadLetterService,
    ContentMetricsService,
    ContentOperationsService,
    ContentRolloutService,
    { provide: LOCALIZATION_V3_PROVIDER, useExisting: OpenAiLocalizationV3Provider },
    {
      provide: LOCALIZATION_SEMANTIC_VERIFIER,
      useExisting: OpenAiLocalizationSemanticVerifier,
    },
    {
      provide: TRANSLATION_PROVIDER,
      inject: [ConfigService, MyMemoryTranslationProvider, OpenAiTranslationProvider],
      useFactory: (
        config: ConfigService,
        myMemory: MyMemoryTranslationProvider,
        openAi: OpenAiTranslationProvider,
      ) => {
        const provider = config.get<string>('TRANSLATION_PROVIDER', 'mymemory');
        if (config.get<string>('NODE_ENV') === 'production' && provider !== 'openai') {
          throw new Error('Production requires TRANSLATION_PROVIDER=openai');
        }
        return provider === 'openai' ? openAi : myMemory;
      },
    },
  ],
  exports: [
    IngestionService,
    IngestionQueue,
    SourceSchedulerService,
    RawSourcePayloadService,
    ContentPipelineTelemetryService,
    RssSourceV2Adapter,
    CanonicalContentService,
    ProvenanceValidatorService,
    ContentDeduplicationService,
    SourceHealthService,
    DeterministicClaimExtractorService,
    ContentClusteringService,
    TerminologyGlossaryService,
    LocalizationV3Service,
    LocalizationQualityV3Service,
    CandidateMatchingService,
    ContentRankingService,
    DailyBriefV2Service,
    LegacyContentBackfillService,
    RawPayloadReplayService,
    DeadLetterService,
    ContentMetricsService,
    ContentOperationsService,
    ContentRolloutService,
  ],
})
export class IngestionModule {}
