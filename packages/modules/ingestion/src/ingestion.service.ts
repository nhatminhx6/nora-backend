import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  DailyBriefStatus,
  EventStatus,
  InsightType,
  InterestStatus,
  Prisma,
  SourceKind,
  SourceStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '@nora/database';
import { NormalizedSourceItem } from './source-adapter';
import { RssSourceAdapter } from './rss-source.adapter';

type FeedItem = NormalizedSourceItem;

type SupportedLocale = 'vi' | 'en';

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
        const topicKey = this.topicKey(interest.config);
        const feedUrl = this.feedUrl(topicKey);
        const source = await this.ensureSource(topicKey, feedUrl);
        const subscription = await this.prisma.sourceSubscription.upsert({
          where: {
            sourceId_subscriptionKey: {
              sourceId: source.id,
              subscriptionKey: `interest:${interest.id}`,
            },
          },
          update: {
            status: SubscriptionStatus.ACTIVE,
            config: { interestId: interest.id, feedUrl },
            nextSyncAt: new Date(Date.now() + source.defaultIntervalSec * 1000),
          },
          create: {
            sourceId: source.id,
            subscriptionKey: `interest:${interest.id}`,
            status: SubscriptionStatus.ACTIVE,
            config: { interestId: interest.id, feedUrl },
            nextSyncAt: new Date(Date.now() + source.defaultIntervalSec * 1000),
          },
        });
        const freshnessCutoff = Date.now() - 7 * 24 * 3_600_000;
        let fetchedItems = feedCache.get(feedUrl);
        if (!fetchedItems) {
          const payloads = await this.rssAdapter.fetch({ url: feedUrl });
          fetchedItems = payloads.flatMap((payload) => {
            const item = this.rssAdapter.normalize(payload);
            return item ? [item] : [];
          });
          feedCache.set(feedUrl, fetchedItems);
        }
        const items = fetchedItems
          .filter((item) => item.publishedAt.getTime() >= freshnessCutoff)
          .filter((item) => this.matchesAnyTerm(searchTerms, `${item.title} ${item.content}`))
          .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());
        for (const item of items.slice(0, 4)) {
          const validation = await this.rssAdapter.validate(item);
          if (!validation.valid || !validation.canonicalUrl || !validation.verifiedAt) {
            this.logger.warn(
              `Rejected RSS item ${item.externalId}: ${validation.errors.join(',')}`,
            );
            continue;
          }
          item.canonicalUrl = validation.canonicalUrl;
          item.metadata.verifiedAt = validation.verifiedAt.toISOString();
          const result = await this.persistItem({
            userId,
            interestId: interest.id,
            sourceId: source.id,
            subscriptionId: subscription.id,
            item,
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
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        interests: { some: { status: InterestStatus.ACTIVE, deletedAt: null } },
      },
      select: { id: true },
    });
    const feedCache = new Map<string, FeedItem[]>();
    for (const user of users) {
      await this.syncUserWithCache(user.id, feedCache);
    }
  }

  private async ensureSource(topicKey: string, feedUrl: string) {
    return this.prisma.source.upsert({
      where: { slug: `vnexpress-${topicKey}` },
      update: { status: SourceStatus.ACTIVE, baseUrl: feedUrl },
      create: {
        name: `VnExpress · ${topicKey}`,
        slug: `vnexpress-${topicKey}`,
        kind: SourceKind.RSS,
        adapterKey: 'vnexpress-topic-rss',
        baseUrl: feedUrl,
        status: SourceStatus.ACTIVE,
        defaultIntervalSec: 900,
        rateLimitPerMinute: 30,
        config: { locale: 'vi', country: 'VN', topicKey },
      },
    });
  }

  private feedUrl(topicKey: string): string {
    const feeds: Record<string, string> = {
      travel: 'https://vnexpress.net/rss/du-lich.rss',
      markets: 'https://vnexpress.net/rss/kinh-doanh.rss',
      technology: 'https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss',
      career: 'https://vnexpress.net/rss/giao-duc.rss',
      health: 'https://vnexpress.net/rss/suc-khoe.rss',
      sports: 'https://vnexpress.net/rss/the-thao.rss',
      entertainment: 'https://vnexpress.net/rss/giai-tri.rss',
      products: 'https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss',
    };
    return feeds[topicKey] ?? 'https://vnexpress.net/rss/tin-moi-nhat.rss';
  }

  private async persistItem(input: {
    userId: string;
    interestId: string;
    sourceId: string;
    subscriptionId: string;
    item: FeedItem;
  }) {
    const externalId = this.hash(input.item.externalId);
    const contentHash = this.hash(`${input.item.title}\n${input.item.content}`);
    const now = new Date();
    const existing = await this.prisma.event.findUnique({
      where: { sourceId_externalId: { sourceId: input.sourceId, externalId } },
      select: { id: true },
    });
    const event =
      existing ??
      (await this.prisma.event.create({
        data: {
          sourceId: input.sourceId,
          sourceSubscriptionId: input.subscriptionId,
          externalId,
          contentHash,
          type: 'NEWS_ARTICLE',
          title: input.item.title,
          content: input.item.content,
          summary: input.item.content,
          url: input.item.canonicalUrl,
          author: input.item.publisher,
          language: input.item.language,
          publishedAt: input.item.publishedAt,
          status: EventStatus.PROCESSED,
          processedAt: now,
          metadata: {
            publisher: input.item.publisher,
            canonicalUrl: input.item.canonicalUrl,
            sourceTier: 2,
            fetchedAt: now.toISOString(),
            verifiedAt: input.item.metadata.verifiedAt,
            originalPublishedAt: input.item.publishedAt.toISOString(),
            contentHash,
            revisions: [],
            ...input.item.metadata,
          },
        },
      }));
    const linked = await this.prisma.insightEvent.findFirst({
      where: { eventId: event.id },
      select: { insightId: true },
    });
    if (linked) {
      await this.ensureLocalizations(linked.insightId, input.item);
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
          matchedReason: { reason: 'rss_term_match', title: input.item.title },
        },
      });
      return { eventCreated: !existing, insightCreated: false };
    }

    const importance = this.importance(input.item.publishedAt);
    const localizations = (
      await Promise.all([
        this.localizeInsight(input.item, 'vi'),
        this.localizeInsight(input.item, 'en'),
      ])
    ).filter((localized) => localized.provider !== 'fallback-original');
    await this.prisma.insight.create({
      data: {
        type: importance >= 0.75 ? InsightType.ALERT : InsightType.SUMMARY,
        title: input.item.title,
        content: input.item.content,
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
            matchedReason: { reason: 'rss_term_match', title: input.item.title },
          },
        },
        localizations: {
          create: localizations.map((localized) => ({
            locale: localized.locale,
            title: localized.title,
            content: localized.content,
            relevanceReason: localized.relevanceReason,
            suggestedAction: localized.suggestedAction,
            provider: localized.provider,
            model: localized.model,
            promptVersion: localized.promptVersion,
            sourceContentHash: localized.sourceContentHash,
            validationStatus: localized.validationStatus,
            qualityScore: localized.qualityScore,
            generatedAt: new Date(),
            metadata: { fallback: false, validator: 'localization-basic-v1' },
          })),
        },
      },
    });
    return { eventCreated: !existing, insightCreated: true };
  }

  private async localizeInsight(
    item: FeedItem,
    locale: SupportedLocale,
  ): Promise<LocalizedInsight> {
    const [titleResult, contentResult] = await Promise.all([
      this.translate(item.title, locale),
      this.translate(item.content, locale),
    ]);
    const title = titleResult.text;
    const content = contentResult.text;
    const provider =
      titleResult.provider === 'fallback-original' || contentResult.provider === 'fallback-original'
        ? 'fallback-original'
        : titleResult.provider === 'mymemory' || contentResult.provider === 'mymemory'
          ? 'mymemory'
          : 'source-original';
    const sourceContentHash = this.hash(`${item.title}\n${item.content}`);
    const numbersPreserved = this.numbers(item.title + item.content).every((value) =>
      `${title}${content}`.includes(value),
    );
    const passed = provider !== 'fallback-original' && numbersPreserved;
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
      model: provider === 'mymemory' ? 'mymemory-api' : 'source-original',
      promptVersion: 'localization-basic-v1',
      sourceContentHash,
      validationStatus: passed ? 'PASSED' : 'FALLBACK_REJECTED',
      qualityScore: passed ? 0.9 : 0,
    };
  }

  private async ensureLocalizations(insightId: string, item: FeedItem): Promise<void> {
    const existing = await this.prisma.insightLocalization.findMany({
      where: { insightId },
      select: { locale: true, provider: true },
    });
    const sourceLanguage = item.language;
    const retryLocales = new Set(
      existing
        .filter(
          (value) =>
            value.provider === 'fallback-original' ||
            value.provider === 'google-translate' ||
            (value.provider === 'source-original' && value.locale !== sourceLanguage),
        )
        .map((value) => value.locale),
    );
    const existingLocales = new Set(existing.map((value) => value.locale));
    const required = (['vi', 'en'] as const).filter(
      (locale) => !existingLocales.has(locale) || retryLocales.has(locale),
    );
    const localizations = (
      await Promise.all(required.map((locale) => this.localizeInsight(item, locale)))
    ).filter((localized) => localized.provider !== 'fallback-original');
    if (localizations.length === 0) return;
    await Promise.all(
      localizations.map((localized) =>
        this.prisma.insightLocalization.upsert({
          where: { insightId_locale: { insightId, locale: localized.locale } },
          update: {
            title: localized.title,
            content: localized.content,
            relevanceReason: localized.relevanceReason,
            suggestedAction: localized.suggestedAction,
            provider: localized.provider,
            model: localized.model,
            promptVersion: localized.promptVersion,
            sourceContentHash: localized.sourceContentHash,
            validationStatus: localized.validationStatus,
            qualityScore: localized.qualityScore,
            generatedAt: new Date(),
            metadata: { fallback: false, validator: 'localization-basic-v1' },
          },
          create: {
            insightId,
            locale: localized.locale,
            title: localized.title,
            content: localized.content,
            relevanceReason: localized.relevanceReason,
            suggestedAction: localized.suggestedAction,
            provider: localized.provider,
            model: localized.model,
            promptVersion: localized.promptVersion,
            sourceContentHash: localized.sourceContentHash,
            validationStatus: localized.validationStatus,
            qualityScore: localized.qualityScore,
            generatedAt: new Date(),
            metadata: { fallback: false, validator: 'localization-basic-v1' },
          },
        }),
      ),
    );
  }

  private async translate(
    value: string,
    target: SupportedLocale,
  ): Promise<{ text: string; provider: string }> {
    const source = this.detectLanguage(value);
    if (source === target) return { text: value, provider: 'source-original' };
    try {
      const parameters = new URLSearchParams({ q: value, langpair: `${source}|${target}` });
      const response = await fetch(
        `https://api.mymemory.translated.net/get?${parameters.toString()}`,
        {
          headers: { 'User-Agent': 'NoraBot/0.1 (+local-development)' },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) throw new Error(`translation returned HTTP ${response.status}`);
      const payload = (await response.json()) as { responseData?: { translatedText?: string } };
      const translated = payload.responseData?.translatedText?.trim();
      return translated
        ? { text: translated, provider: 'mymemory' }
        : { text: value, provider: 'fallback-original' };
    } catch (error) {
      this.logger.warn(
        `Translation to ${target} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { text: value, provider: 'fallback-original' };
    }
  }

  private detectLanguage(value: string): SupportedLocale {
    const vietnameseCharacters =
      value.match(/[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/gi)
        ?.length ?? 0;
    return vietnameseCharacters >= 3 ? 'vi' : 'en';
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
    const rows: typeof relevantCandidates = [];
    while (rows.length < 8 && [...buckets.values()].some((bucket) => bucket.length > 0)) {
      for (const bucket of buckets.values()) {
        const next = bucket.shift();
        if (next) rows.push(next);
        if (rows.length === 8) break;
      }
    }
    if (rows.length === 0) return null;
    await Promise.all(
      rows.map(async (row) => {
        const event = row.insight.insightEvents[0]?.event;
        if (!event) return;
        const metadata = this.object(event.metadata);
        await this.ensureLocalizations(row.insightId, {
          externalId: event.externalId,
          title: event.title,
          content: event.content,
          canonicalUrl: event.url ?? '',
          publishedAt: event.publishedAt,
          publisher: event.author ?? 'VnExpress',
          language: event.language === 'en' ? 'en' : 'vi',
          metadata: {
            verifiedAt: typeof metadata.verifiedAt === 'string' ? metadata.verifiedAt : '',
            discoveryUrl:
              typeof metadata.discoveryUrl === 'string' ? metadata.discoveryUrl : (event.url ?? ''),
          },
        });
      }),
    );
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

  private object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
