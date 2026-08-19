import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DailyBriefStatus,
  EventStatus,
  InsightType,
  InterestStatus,
  Prisma,
  SourceStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '@nora/database';
import { NormalizedSourceItem } from './source-adapter';
import { RssSourceAdapter } from './rss-source.adapter';
import { SourceProfile } from './source-profile';
import { sourceProfile } from './source-registry';
import { TRANSLATION_PROVIDER, TranslationProvider } from './translation-provider';
import { IngestionQueue } from './ingestion.queue';
import { LocalizationQualityValidator } from './localization-quality.validator';

type FeedItem = NormalizedSourceItem;

type SupportedLocale = 'vi' | 'en';

const DAILY_BRIEF_ITEM_LIMIT = 10;
const LOCALIZATION_PROMPT_VERSION = 'localization-quality-v2';
const LEGACY_VALIDATION_FAILURE_LIMIT = 3;

export function shouldOpenLegacyValidationCircuit(
  errors: string[],
  consecutiveAccessFailures: number,
): boolean {
  return (
    consecutiveAccessFailures >= LEGACY_VALIDATION_FAILURE_LIMIT &&
    errors.some((error) => ['HTTP_403', 'HTTP_429', 'FETCH_FAILED'].includes(error))
  );
}

interface LocalizedInsight {
  locale: SupportedLocale;
  title: string;
  content: string;
  relevanceReason: string;
  suggestedAction: string;
  provider: string;
  model: string;
  promptVersion: string;
  sourceContentHash: string;
  validationStatus: 'PASSED' | 'FALLBACK_REJECTED';
  qualityScore: number;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rssAdapter: RssSourceAdapter,
    @Inject(TRANSLATION_PROVIDER) private readonly translationProvider: TranslationProvider,
    private readonly ingestionQueue: IngestionQueue,
    private readonly localizationValidator: LocalizationQualityValidator,
  ) {}

  async syncUser(
    userId: string,
  ): Promise<{ interests: number; events: number; insights: number; briefId: string | null }> {
    return this.syncUserWithCache(userId, new Map());
  }

  private async syncUserWithCache(
    userId: string,
    feedCache: Map<string, FeedItem[]>,
  ): Promise<{ interests: number; events: number; insights: number; briefId: string | null }> {
    const interests = await this.prisma.interest.findMany({
      where: { userId, status: InterestStatus.ACTIVE, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    let eventCount = 0;
    let insightCount = 0;

    for (const interest of interests) {
      try {
        const searchTerms = this.interestSearchTerms(interest.name, interest.config);
        const topicKey = interest.topicKey ?? this.topicKey(interest.config);
        const profile = sourceProfile(topicKey);
        if (profile.language === 'zh-Hans') throw new Error('SOURCE_LANGUAGE_DISABLED');
        const sourceLanguage = profile.language;
        const feedUrl = profile.feedUrl;
        const source = await this.ensureSource(profile);
        const subscription = await this.prisma.sourceSubscription.upsert({
          where: {
            sourceId_subscriptionKey: {
              sourceId: source.id,
              subscriptionKey: `interest:${interest.id}`,
            },
          },
          update: {
            status: SubscriptionStatus.ACTIVE,
            config: { interestId: interest.id, feedUrl, adapterKey: profile.adapterKey },
            nextSyncAt: new Date(Date.now() + source.defaultIntervalSec * 1000),
          },
          create: {
            sourceId: source.id,
            subscriptionKey: `interest:${interest.id}`,
            status: SubscriptionStatus.ACTIVE,
            config: { interestId: interest.id, feedUrl, adapterKey: profile.adapterKey },
            nextSyncAt: new Date(Date.now() + source.defaultIntervalSec * 1000),
          },
        });
        let fetchedItems = feedCache.get(feedUrl);
        if (!fetchedItems) {
          const payloads = await this.rssAdapter.fetch({ url: feedUrl });
          fetchedItems = payloads.flatMap((payload) => {
            const item = this.rssAdapter.normalize(payload);
            if (!item) return [];
            item.publisher = profile.name;
            item.language = sourceLanguage;
            return [item];
          });
          feedCache.set(feedUrl, fetchedItems);
        }
        const items = fetchedItems
          .filter(
            (item) =>
              profile.selectionPolicy === 'ALL_ITEMS' ||
              this.matchesAnyTerm(searchTerms, `${item.title} ${item.content}`),
          )
          .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());
        let consecutiveAccessFailures = 0;
        for (const item of items) {
          if (item.metadata.validationRejected === 'true') continue;
          if (!item.metadata.verifiedAt) {
            const validation = await this.rssAdapter.validate(item);
            if (!validation.valid || !validation.canonicalUrl || !validation.verifiedAt) {
              item.metadata.validationRejected = 'true';
              item.metadata.validationErrors = validation.errors.join(',');
              await this.rejectExistingEvent(source.id, item, validation.errors);
              this.logger.warn(
                `Rejected RSS item ${item.externalId}: ${validation.errors.join(',')}`,
              );
              consecutiveAccessFailures = validation.errors.some((error) =>
                ['HTTP_403', 'HTTP_429', 'FETCH_FAILED'].includes(error),
              )
                ? consecutiveAccessFailures + 1
                : 0;
              if (shouldOpenLegacyValidationCircuit(validation.errors, consecutiveAccessFailures)) {
                this.logger.warn(
                  `Stopped detail validation for ${profile.slug}: repeated source access failures`,
                );
                break;
              }
              continue;
            }
            consecutiveAccessFailures = 0;
            item.canonicalUrl = validation.canonicalUrl;
            item.metadata.verifiedAt = validation.verifiedAt.toISOString();
          }
          const result = await this.persistItem({
            userId,
            interestId: interest.id,
            sourceId: source.id,
            subscriptionId: subscription.id,
            item,
            sourceTier: profile.sourceTier,
          });
          eventCount += result.eventCreated ? 1 : 0;
          insightCount += result.insightCreated ? 1 : 0;
        }
        await this.prisma.sourceSubscription.update({
          where: { id: subscription.id },
          data: {
            lastSyncAt: new Date(),
            lastSuccessAt: new Date(),
            consecutiveFailures: 0,
            lastErrorCode: null,
          },
        });
        await this.prisma.source.update({
          where: { id: source.id },
          data: { lastSyncedAt: new Date() },
        });
      } catch (error) {
        this.logger.warn(
          `RSS sync failed for interest ${interest.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    const briefId = await this.rebuildTodayBrief(userId);
    return { interests: interests.length, events: eventCount, insights: insightCount, briefId };
  }

  async syncAllUsers(): Promise<void> {
    const startedAt = Date.now();
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        interests: { some: { status: InterestStatus.ACTIVE, deletedAt: null } },
      },
      select: { id: true },
    });
    let processedCount = 0;
    let rejectedCount = 0;
    const feedCache = new Map<string, FeedItem[]>();
    for (const user of users) {
      try {
        const result = await this.syncUserWithCache(user.id, feedCache);
        processedCount += result.events;
      } catch (error) {
        rejectedCount += 1;
        this.logger.error(
          `Source-centric sync failed for user ${user.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    await this.prisma.pipelineRun.create({
      data: {
        pipeline: 'source-sync',
        status: rejectedCount === 0 ? 'SUCCEEDED' : 'PARTIAL',
        processedCount,
        rejectedCount,
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
        metadata: { users: users.length, uniqueFeedsFetched: feedCache.size },
      },
    });
  }

  private async ensureSource(profile: SourceProfile) {
    return this.prisma.source.upsert({
      where: { slug: profile.slug },
      update: {
        name: profile.name,
        kind: profile.kind,
        status: profile.enabled ? SourceStatus.ACTIVE : SourceStatus.DISABLED,
        baseUrl: profile.feedUrl,
        adapterKey: profile.adapterKey,
        defaultIntervalSec: profile.updateIntervalSec,
        rateLimitPerMinute: profile.rateLimitPerMinute,
        config: {
          language: profile.language,
          markets: profile.markets,
          topics: profile.topics,
          sourceTier: profile.sourceTier,
          authorityScore: profile.authorityScore,
          licensePolicy: profile.licensePolicy,
          verificationPolicy: profile.verificationPolicy,
          selectionPolicy: profile.selectionPolicy,
          enabled: profile.enabled,
        },
      },
      create: {
        name: profile.name,
        slug: profile.slug,
        kind: profile.kind,
        adapterKey: profile.adapterKey,
        baseUrl: profile.feedUrl,
        status: profile.enabled ? SourceStatus.ACTIVE : SourceStatus.DISABLED,
        defaultIntervalSec: profile.updateIntervalSec,
        rateLimitPerMinute: profile.rateLimitPerMinute,
        config: {
          language: profile.language,
          markets: profile.markets,
          topics: profile.topics,
          sourceTier: profile.sourceTier,
          authorityScore: profile.authorityScore,
          licensePolicy: profile.licensePolicy,
          verificationPolicy: profile.verificationPolicy,
          selectionPolicy: profile.selectionPolicy,
          enabled: profile.enabled,
        },
      },
    });
  }

  private async persistItem(input: {
    userId: string;
    interestId: string;
    sourceId: string;
    subscriptionId: string;
    item: FeedItem;
    sourceTier: 1 | 2 | 3;
  }) {
    const externalId = this.hash(input.item.canonicalUrl);
    const contentHash = this.hash(`${input.item.title}\n${input.item.content}`);
    const now = new Date();
    let existing = await this.prisma.event.findFirst({
      where: { OR: [{ sourceId: input.sourceId, externalId }, { url: input.item.canonicalUrl }] },
      select: { id: true, contentHash: true, url: true, metadata: true },
    });
    let eventCreated = false;
    let event;
    if (existing) {
      event = await this.updateExistingEvent(existing, input, externalId, contentHash, now);
    } else {
      try {
        event = await this.prisma.event.create({
          data: {
            sourceId: input.sourceId,
            sourceSubscriptionId: input.subscriptionId,
            externalId,
            contentHash,
            type: 'NEWS_ARTICLE',
            title: input.item.title,
            content: input.item.content,
            summary: this.summaryContent(input.item.content),
            url: input.item.canonicalUrl,
            author: input.item.publisher,
            language: input.item.language,
            publishedAt: input.item.publishedAt,
            status: EventStatus.PROCESSED,
            processedAt: now,
            metadata: {
              publisher: input.item.publisher,
              canonicalUrl: input.item.canonicalUrl,
              sourceTier: input.sourceTier,
              fetchedAt: now.toISOString(),
              verifiedAt: input.item.metadata.verifiedAt,
              originalPublishedAt: input.item.publishedAt.toISOString(),
              contentHash,
              revisions: [],
              ...input.item.metadata,
            },
          },
        });
        eventCreated = true;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
        existing = await this.prisma.event.findFirstOrThrow({
          where: { url: input.item.canonicalUrl },
          select: { id: true, contentHash: true, url: true, metadata: true },
        });
        event = await this.updateExistingEvent(existing, input, externalId, contentHash, now);
      }
    }
    const linked = await this.prisma.insightEvent.findFirst({
      where: { eventId: event.id },
      select: { insightId: true },
    });
    if (linked) {
      await this.prisma.insight.update({
        where: { id: linked.insightId },
        data: {
          title: input.item.title,
          content: this.summaryContent(input.item.content),
          language: input.item.language,
          metadata: {
            publisher: input.item.publisher,
            canonicalUrl: input.item.canonicalUrl,
            sourceContentHash: contentHash,
            articleUrl: input.item.canonicalUrl,
            suggestedAction: 'Open source',
          },
        },
      });
      await this.enqueueRequiredLocalizations(linked.insightId, input.item);
      await this.prisma.userInsight.upsert({
        where: {
          userId_insightId_interestId: {
            userId: input.userId,
            insightId: linked.insightId,
            interestId: input.interestId,
          },
        },
        update: { relevanceScore: 1 },
        create: {
          userId: input.userId,
          insightId: linked.insightId,
          interestId: input.interestId,
          relevanceScore: 1,
          matchedReason: { code: 'RSS_TERM_MATCH', matchedTitle: input.item.title },
        },
      });
      return { eventCreated, insightCreated: false };
    }

    const importance = this.importance(input.item.publishedAt);
    const insight = await this.prisma.insight.create({
      data: {
        type: importance >= 0.75 ? InsightType.ALERT : InsightType.SUMMARY,
        title: input.item.title,
        content: this.summaryContent(input.item.content),
        language: input.item.language,
        importanceScore: importance,
        confidenceScore: 1,
        modelProvider: 'source-extractive',
        modelName: 'rss-v1',
        promptVersion: 'none',
        metadata: {
          publisher: input.item.publisher,
          canonicalUrl: input.item.canonicalUrl,
          sourceContentHash: contentHash,
          articleUrl: input.item.canonicalUrl,
          suggestedAction: 'Open source',
        },
        insightEvents: { create: { eventId: event.id } },
        userInsights: {
          create: {
            userId: input.userId,
            interestId: input.interestId,
            relevanceScore: 1,
            matchedReason: { code: 'RSS_TERM_MATCH', matchedTitle: input.item.title },
          },
        },
      },
    });
    await this.enqueueRequiredLocalizations(insight.id, input.item);
    return { eventCreated, insightCreated: true };
  }

  private async updateExistingEvent(
    existing: { id: string; contentHash: string; url: string | null; metadata: Prisma.JsonValue },
    input: {
      subscriptionId: string;
      item: FeedItem;
      sourceTier: 1 | 2 | 3;
    },
    externalId: string,
    contentHash: string,
    now: Date,
  ) {
    const previousMetadata = this.object(existing.metadata);
    const previousRevisions = Array.isArray(previousMetadata.revisions)
      ? previousMetadata.revisions
      : [];
    const changed =
      existing.contentHash !== contentHash || existing.url !== input.item.canonicalUrl;
    return this.prisma.event.update({
      where: { id: existing.id },
      data: {
        sourceSubscriptionId: input.subscriptionId,
        externalId,
        contentHash,
        title: input.item.title,
        content: input.item.content,
        summary: this.summaryContent(input.item.content),
        url: input.item.canonicalUrl,
        author: input.item.publisher,
        language: input.item.language,
        publishedAt: input.item.publishedAt,
        status: EventStatus.PROCESSED,
        processedAt: now,
        metadata: {
          publisher: input.item.publisher,
          canonicalUrl: input.item.canonicalUrl,
          sourceTier: input.sourceTier,
          fetchedAt: now.toISOString(),
          verifiedAt: input.item.metadata.verifiedAt,
          originalPublishedAt: input.item.publishedAt.toISOString(),
          contentHash,
          revisions: changed
            ? [
                ...previousRevisions,
                {
                  url: existing.url,
                  contentHash: existing.contentHash,
                  correctedAt: now.toISOString(),
                  reason: 'SOURCE_CONTENT_REFRESHED',
                },
              ]
            : previousRevisions,
          ...input.item.metadata,
        },
      },
    });
  }

  private async rejectExistingEvent(
    sourceId: string,
    item: FeedItem,
    errors: string[],
  ): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: { sourceId, url: item.canonicalUrl, status: { not: EventStatus.REJECTED } },
      select: { id: true, metadata: true, url: true, contentHash: true },
    });
    if (!event) return;
    const now = new Date();
    const metadata = this.object(event.metadata);
    const revisions = Array.isArray(metadata.revisions) ? metadata.revisions : [];
    await this.prisma.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.REJECTED,
        metadata: {
          ...metadata,
          invalidatedAt: now.toISOString(),
          invalidationReason: errors.join(','),
          revisions: [
            ...revisions,
            {
              url: event.url,
              contentHash: event.contentHash,
              correctedAt: now.toISOString(),
              reason: 'SOURCE_REVALIDATION_FAILED',
            },
          ],
        },
      },
    });
  }

  private async localizeInsight(
    item: FeedItem,
    locale: SupportedLocale,
  ): Promise<LocalizedInsight> {
    const sourceSummary = this.summaryContent(item.content);
    const titleResult = await this.translationProvider.translate(item.title, item.language, locale);
    const contentResult = await this.translationProvider.translate(
      sourceSummary,
      item.language,
      locale,
    );
    const title = titleResult.text;
    const content = contentResult.text;
    const provider =
      titleResult.provider === 'fallback-original' || contentResult.provider === 'fallback-original'
        ? 'fallback-original'
        : titleResult.provider;
    const sourceContentHash = this.hash(`${item.title}\n${item.content}`);
    const quality = this.localizationValidator.validate({
      sourceTitle: item.title,
      sourceContent: sourceSummary,
      localizedTitle: title,
      localizedContent: content,
      sourceLocale: item.language,
      targetLocale: locale,
    });
    const passed = provider !== 'fallback-original' && quality.passed;
    return {
      locale,
      title,
      content,
      relevanceReason:
        locale === 'vi'
          ? `Nội dung này liên quan đến chủ đề anh đang theo dõi: ${title}`
          : `This is relevant to a topic you are tracking: ${title}`,
      suggestedAction: locale === 'vi' ? 'Mở bài viết gốc' : 'Open source',
      provider: passed ? provider : 'fallback-original',
      model: contentResult.model,
      promptVersion: LOCALIZATION_PROMPT_VERSION,
      sourceContentHash,
      validationStatus: passed ? 'PASSED' : 'FALLBACK_REJECTED',
      qualityScore: passed ? quality.score : 0,
    };
  }

  private async enqueueRequiredLocalizations(insightId: string, item: FeedItem): Promise<void> {
    const sourceContentHash = this.hash(`${item.title}\n${item.content}`);
    await Promise.all(
      (['vi', 'en'] as const).map((locale) =>
        this.ingestionQueue.enqueueLocalization({
          insightId,
          locale,
          sourceContentHash,
          promptVersion: LOCALIZATION_PROMPT_VERSION,
        }),
      ),
    );
  }

  async localizeInsightById(input: {
    insightId: string;
    locale: SupportedLocale;
    sourceContentHash: string;
    promptVersion: string;
  }): Promise<{ status: 'created' | 'reused'; qualityScore: number }> {
    const startedAt = Date.now();
    const identity = {
      insightId: input.insightId,
      locale: input.locale,
      sourceContentHash: input.sourceContentHash,
      promptVersion: input.promptVersion,
    };
    const existingRevision = await this.prisma.insightLocalizationRevision.findUnique({
      where: { insightId_locale_sourceContentHash_promptVersion: identity },
    });
    if (existingRevision?.validationStatus === 'PASSED')
      return { status: 'reused', qualityScore: Number(existingRevision.qualityScore) };

    const insight = await this.prisma.insight.findUniqueOrThrow({
      where: { id: input.insightId },
      include: { insightEvents: { include: { event: true }, take: 1 } },
    });
    const event = insight.insightEvents[0]?.event;
    if (!event || event.status !== EventStatus.PROCESSED || !event.url)
      throw new Error('LOCALIZATION_SOURCE_NOT_VERIFIED');
    if (event.contentHash !== input.sourceContentHash) throw new Error('LOCALIZATION_STALE_JOB');
    const eventMetadata = this.object(event.metadata);
    if (typeof eventMetadata.verifiedAt !== 'string')
      throw new Error('LOCALIZATION_SOURCE_NOT_VERIFIED');
    const item: FeedItem = {
      externalId: event.externalId,
      title: event.title,
      content: event.content,
      canonicalUrl: event.url,
      publishedAt: event.publishedAt,
      publisher: event.author ?? 'Unknown',
      language: event.language === 'vi' ? 'vi' : 'en',
      metadata: {
        verifiedAt: eventMetadata.verifiedAt,
        discoveryUrl:
          typeof eventMetadata.discoveryUrl === 'string' ? eventMetadata.discoveryUrl : event.url,
      },
    };
    const localized = await this.localizeInsight(item, input.locale);
    const quality = this.localizationValidator.validate({
      sourceTitle: item.title,
      sourceContent: this.summaryContent(item.content),
      localizedTitle: localized.title,
      localizedContent: localized.content,
      sourceLocale: item.language,
      targetLocale: input.locale,
    });
    const publishable = quality.passed && localized.provider !== 'fallback-original';
    const failureReasons = publishable
      ? quality.failureReasons
      : [...new Set([...quality.failureReasons, 'PROVIDER_UNAVAILABLE'])];
    const validationStatus = publishable ? 'PASSED' : 'REJECTED';

    await this.prisma.$transaction(async (transaction) => {
      await transaction.insightLocalizationRevision.upsert({
        where: { insightId_locale_sourceContentHash_promptVersion: identity },
        update: {
          title: localized.title,
          content: localized.content,
          relevanceReason: localized.relevanceReason,
          suggestedAction: localized.suggestedAction,
          provider: localized.provider,
          model: localized.model,
          validationStatus,
          qualityScore: quality.score,
          failureReasons,
          evidence: quality.evidence,
          correctionReason: 'AUTOMATED_RETRY',
        },
        create: {
          ...identity,
          title: localized.title,
          content: localized.content,
          relevanceReason: localized.relevanceReason,
          suggestedAction: localized.suggestedAction,
          provider: localized.provider,
          model: localized.model,
          validationStatus,
          qualityScore: quality.score,
          failureReasons,
          evidence: quality.evidence,
          metadata: { validator: 'localization-quality-v2' },
        },
      });
      if (publishable) {
        await transaction.insightLocalization.upsert({
          where: { insightId_locale: { insightId: input.insightId, locale: input.locale } },
          update: {
            title: localized.title,
            content: localized.content,
            relevanceReason: localized.relevanceReason,
            suggestedAction: localized.suggestedAction,
            provider: localized.provider,
            model: localized.model,
            promptVersion: input.promptVersion,
            sourceContentHash: input.sourceContentHash,
            validationStatus,
            qualityScore: quality.score,
            generatedAt: new Date(),
            metadata: { fallback: false, validator: 'localization-quality-v2' },
          },
          create: {
            insightId: input.insightId,
            locale: input.locale,
            title: localized.title,
            content: localized.content,
            relevanceReason: localized.relevanceReason,
            suggestedAction: localized.suggestedAction,
            provider: localized.provider,
            model: localized.model,
            promptVersion: input.promptVersion,
            sourceContentHash: input.sourceContentHash,
            validationStatus,
            qualityScore: quality.score,
            generatedAt: new Date(),
            metadata: { fallback: false, validator: 'localization-quality-v2' },
          },
        });
      }
      await transaction.pipelineRun.create({
        data: {
          pipeline: 'localization',
          status: publishable ? 'SUCCEEDED' : 'REJECTED',
          insightId: input.insightId,
          locale: input.locale,
          processedCount: publishable ? 1 : 0,
          rejectedCount: publishable ? 0 : 1,
          errorCode: failureReasons[0] ?? null,
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
          metadata: { provider: localized.provider, model: localized.model },
        },
      });
    });
    if (!publishable) throw new Error(`LOCALIZATION_QUALITY_REJECTED:${failureReasons.join(',')}`);

    const users = await this.prisma.userInsight.findMany({
      where: { insightId: input.insightId },
      distinct: ['userId'],
      select: { userId: true },
    });
    await Promise.all(users.map((user) => this.rebuildTodayBrief(user.userId)));
    return { status: 'created', qualityScore: quality.score };
  }

  async enqueuePendingLocalizations(): Promise<{ insights: number; jobs: number }> {
    const insights = await this.prisma.insight.findMany({
      where: {
        userInsights: { some: {} },
        insightEvents: { some: { event: { status: EventStatus.PROCESSED } } },
        OR: [
          { localizations: { none: { locale: 'vi' } } },
          { localizations: { none: { locale: 'en' } } },
        ],
      },
      take: 200,
      include: {
        localizations: { select: { locale: true, sourceContentHash: true, promptVersion: true } },
        insightEvents: { include: { event: true }, take: 1 },
      },
    });
    let jobs = 0;
    for (const insight of insights) {
      const event = insight.insightEvents[0]?.event;
      if (!event) continue;
      for (const locale of ['vi', 'en'] as const) {
        const current = insight.localizations.find(
          (localization) =>
            localization.locale === locale &&
            localization.sourceContentHash === event.contentHash &&
            localization.promptVersion === LOCALIZATION_PROMPT_VERSION,
        );
        if (current) continue;
        await this.ingestionQueue.enqueueLocalization({
          insightId: insight.id,
          locale,
          sourceContentHash: event.contentHash,
          promptVersion: LOCALIZATION_PROMPT_VERSION,
        });
        jobs += 1;
      }
    }
    return { insights: insights.length, jobs };
  }

  async recordJobFailure(jobType: string, error: Error, metadata: Prisma.InputJsonObject) {
    await this.prisma.pipelineRun.create({
      data: {
        pipeline: jobType,
        status: 'FAILED',
        errorCode: error.message.split(':', 1)[0]?.slice(0, 80) || 'UNKNOWN',
        rejectedCount: 1,
        completedAt: new Date(),
        metadata,
      },
    });
  }

  private async rebuildTodayBrief(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const dateKey = this.localDate(user.timezone);
    const briefDate = new Date(`${dateKey}T00:00:00.000Z`);
    const freshnessCutoff = new Date(Date.now() - 7 * 24 * 3_600_000);
    const candidates = await this.prisma.userInsight.findMany({
      where: {
        userId,
        status: { not: 'DISMISSED' },
        interestId: { not: null },
        insight: { insightEvents: { some: { event: { publishedAt: { gte: freshnessCutoff } } } } },
      },
      take: 80,
      include: {
        interest: true,
        insight: { include: { insightEvents: { include: { event: true } } } },
      },
    });
    const relevantCandidates = candidates.filter((candidate) =>
      Boolean(
        candidate.insight.insightEvents[0]?.event &&
        candidate.insight.insightEvents[0].event.status === EventStatus.PROCESSED &&
        candidate.interest,
      ),
    );
    relevantCandidates.sort((left, right) => {
      const leftDate = left.insight.insightEvents[0]?.event.publishedAt.getTime() ?? 0;
      const rightDate = right.insight.insightEvents[0]?.event.publishedAt.getTime() ?? 0;
      return rightDate - leftDate;
    });
    const buckets = new Map<string, typeof relevantCandidates>();
    for (const candidate of relevantCandidates) {
      if (!candidate.interestId) continue;
      const bucket = buckets.get(candidate.interestId) ?? [];
      bucket.push(candidate);
      buckets.set(candidate.interestId, bucket);
    }
    const primaryFreshnessCutoff = Date.now() - 48 * 3_600_000;
    for (const [interestId, bucket] of buckets) {
      const fresh = bucket.filter(
        (candidate) =>
          (candidate.insight.insightEvents[0]?.event.publishedAt.getTime() ?? 0) >=
          primaryFreshnessCutoff,
      );
      if (fresh.length > 0) buckets.set(interestId, fresh);
    }
    const rows: typeof relevantCandidates = [];
    while (
      rows.length < DAILY_BRIEF_ITEM_LIMIT &&
      [...buckets.values()].some((bucket) => bucket.length > 0)
    ) {
      for (const bucket of buckets.values()) {
        const next = bucket.shift();
        if (next) rows.push(next);
        if (rows.length === DAILY_BRIEF_ITEM_LIMIT) break;
      }
    }
    if (rows.length === 0) return null;
    const brief = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.dailyBrief.upsert({
        where: { userId_briefDate: { userId, briefDate } },
        update: {
          timezone: user.timezone,
          status: DailyBriefStatus.READY,
          title: `${rows.length} cập nhật từ các chủ đề đang theo dõi`,
          summary: 'Được tổng hợp từ các bài viết có nguồn đã xác minh.',
          generatedAt: new Date(),
          metadata: { pipeline: 'rss-v2', sourceLinked: true, dateKey },
        },
        create: {
          userId,
          briefDate,
          timezone: user.timezone,
          status: DailyBriefStatus.READY,
          title: `${rows.length} cập nhật từ các chủ đề đang theo dõi`,
          summary: 'Được tổng hợp từ các bài viết có nguồn đã xác minh.',
          generatedAt: new Date(),
          metadata: { pipeline: 'rss-v2', sourceLinked: true, dateKey },
        },
      });
      await transaction.dailyBriefItem.deleteMany({ where: { dailyBriefId: current.id } });
      await transaction.dailyBriefItem.createMany({
        data: rows.map((row, index) => ({
          dailyBriefId: current.id,
          userInsightId: row.id,
          position: index + 1,
          section: Number(row.insight.importanceScore) >= 0.75 ? 'important' : 'other',
          title: row.insight.title,
          content: row.insight.content,
          metadata: { sourceLinked: true },
        })),
      });
      return current;
    });
    return brief.id;
  }

  private localDate(timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private importance(publishedAt: Date): number {
    const ageHours = Math.max(0, (Date.now() - publishedAt.getTime()) / 3_600_000);
    if (ageHours <= 6) return 0.82;
    if (ageHours <= 24) return 0.72;
    return 0.58;
  }

  private matchesInterest(interestName: string, content: string): boolean {
    const generic = new Set(['market', 'development', 'topic', 'news', 'today']);
    const keywords = this.normalize(interestName)
      .split(/[^a-z0-9]+/)
      .filter((value) => value.length >= 3 && !generic.has(value));
    if (keywords.length === 0) return false;
    const normalizedContent = this.normalize(content);
    return keywords.some((keyword) => normalizedContent.includes(keyword));
  }

  private interestSearchTerms(name: string, rawConfig: Prisma.JsonValue): string[] {
    const config = this.object(rawConfig);
    const refinements = Array.isArray(config.refinements)
      ? config.refinements.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0,
        )
      : [];
    const topicAliases: Record<string, string[]> = {
      travel: ['Du lịch', 'Travel'],
      markets: ['Kinh doanh', 'Thị trường', 'Đầu tư', 'Markets'],
      technology: ['Công nghệ', 'Technology'],
      career: ['Giáo dục', 'Việc làm', 'Sự nghiệp', 'Career'],
      health: ['Sức khỏe', 'Health'],
      sports: ['Thể thao', 'Sports'],
      entertainment: ['Giải trí', 'Entertainment'],
      products: ['Sản phẩm', 'Công nghệ', 'Products'],
    };
    return [...new Set([name, ...(topicAliases[this.topicKey(rawConfig)] ?? []), ...refinements])];
  }

  private topicKey(rawConfig: Prisma.JsonValue): string {
    const value = this.object(rawConfig).topicKey;
    return typeof value === 'string' && value.length > 0 ? value : 'latest';
  }

  private matchesAnyTerm(terms: string[], content: string): boolean {
    return terms.some((term) => this.matchesInterest(term, content));
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('en-US');
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private numbers(value: string): string[] {
    return value.match(/\d+(?:[.,]\d+)*(?:%|\s?(?:USD|VND|BTC))?/giu) ?? [];
  }

  private summaryContent(value: string): string {
    if (value.length <= 500) return value;
    const candidate = value.slice(0, 500);
    const sentenceEnd = Math.max(
      candidate.lastIndexOf('. '),
      candidate.lastIndexOf('! '),
      candidate.lastIndexOf('? '),
    );
    return (sentenceEnd >= 160 ? candidate.slice(0, sentenceEnd + 1) : candidate).trim();
  }

  private object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
