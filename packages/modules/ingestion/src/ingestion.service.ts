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
import { XMLParser } from 'fast-xml-parser';
import { PrismaService } from '@nora/database';

interface FeedItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  publishedAt: Date;
  sourceName: string;
  sourceUrl?: string;
}

type SupportedLocale = 'vi' | 'en';

interface LocalizedInsight {
  locale: SupportedLocale;
  title: string;
  content: string;
  relevanceReason: string;
  suggestedAction: string;
  provider: string;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  constructor(private readonly prisma: PrismaService) {}

  async syncUser(userId: string): Promise<{ interests: number; events: number; insights: number; briefId: string | null }> {
    const interests = await this.prisma.interest.findMany({
      where: { userId, status: InterestStatus.ACTIVE, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const source = await this.ensureSource();
    let eventCount = 0;
    let insightCount = 0;

    for (const interest of interests) {
      try {
        const feedUrl = this.feedUrl(interest.name);
        const subscription = await this.prisma.sourceSubscription.upsert({
          where: { sourceId_subscriptionKey: { sourceId: source.id, subscriptionKey: `interest:${interest.id}` } },
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
        const items = (await this.fetchFeed(feedUrl)).filter(
          (item) => item.publishedAt.getTime() >= freshnessCutoff && this.matchesInterest(interest.name, `${item.title} ${item.description}`),
        );
        for (const item of items.slice(0, 8)) {
          const result = await this.persistItem({ userId, interestId: interest.id, sourceId: source.id, subscriptionId: subscription.id, item });
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
      } catch (error) {
        this.logger.warn(`RSS sync failed for interest ${interest.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastSyncedAt: new Date() } });
    const briefId = await this.rebuildTodayBrief(userId);
    return { interests: interests.length, events: eventCount, insights: insightCount, briefId };
  }

  async syncAllUsers(): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null, interests: { some: { status: InterestStatus.ACTIVE, deletedAt: null } } },
      select: { id: true },
    });
    for (const user of users) {
      await this.syncUser(user.id);
    }
  }

  private async ensureSource() {
    return this.prisma.source.upsert({
      where: { slug: 'google-news-rss' },
      update: { status: SourceStatus.ACTIVE },
      create: {
        name: 'Google News',
        slug: 'google-news-rss',
        kind: SourceKind.RSS,
        adapterKey: 'google-news-search-rss',
        baseUrl: 'https://news.google.com',
        status: SourceStatus.ACTIVE,
        defaultIntervalSec: 900,
        rateLimitPerMinute: 30,
        config: { locale: 'vi', country: 'VN' },
      },
    });
  }

  private feedUrl(query: string): string {
    const parameters = new URLSearchParams({ q: `"${query}" when:7d`, hl: 'vi', gl: 'VN', ceid: 'VN:vi' });
    return `https://news.google.com/rss/search?${parameters.toString()}`;
  }

  private async fetchFeed(url: string): Promise<FeedItem[]> {
    const response = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9', 'User-Agent': 'NoraBot/0.1 (+local-development)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`RSS returned HTTP ${response.status}`);
    const document = this.parser.parse(await response.text()) as Record<string, unknown>;
    const rss = this.object(document.rss);
    const channel = this.object(rss.channel);
    const rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
    return rawItems.flatMap((value): FeedItem[] => {
      const item = this.object(value);
      const title = this.text(item.title);
      const link = this.text(item.link);
      const publishedAt = new Date(this.text(item.pubDate));
      if (!title || !link || Number.isNaN(publishedAt.getTime())) return [];
      const source = this.object(item.source);
      return [{
        title: this.clean(title),
        description: this.clean(this.text(item.description)),
        link,
        guid: this.text(item.guid) || link,
        publishedAt,
        sourceName: this.clean(this.text(source['#text'])) || 'Google News',
        sourceUrl: this.text(source['@_url']) || undefined,
      }];
    });
  }

  private async persistItem(input: { userId: string; interestId: string; sourceId: string; subscriptionId: string; item: FeedItem }) {
    const externalId = this.hash(input.item.guid);
    const existing = await this.prisma.event.findUnique({
      where: { sourceId_externalId: { sourceId: input.sourceId, externalId } },
      select: { id: true },
    });
    const event = existing ?? await this.prisma.event.create({
      data: {
        sourceId: input.sourceId,
        sourceSubscriptionId: input.subscriptionId,
        externalId,
        contentHash: this.hash(`${input.item.title}\n${input.item.description}`),
        type: 'NEWS_ARTICLE',
        title: input.item.title,
        content: input.item.description || input.item.title,
        summary: input.item.description || null,
        url: input.item.link,
        author: input.item.sourceName,
        language: 'vi',
        publishedAt: input.item.publishedAt,
        status: EventStatus.PROCESSED,
        processedAt: new Date(),
        metadata: { sourceName: input.item.sourceName, sourceUrl: input.item.sourceUrl ?? input.item.link },
      },
    });
    const linked = await this.prisma.insightEvent.findFirst({
      where: { eventId: event.id, insight: { userInsights: { some: { userId: input.userId, interestId: input.interestId } } } },
      select: { insightId: true },
    });
    if (linked) {
      await this.ensureLocalizations(linked.insightId, input.item);
      return { eventCreated: !existing, insightCreated: false };
    }

    const importance = this.importance(input.item.publishedAt);
    const localizations = await Promise.all([
      this.localizeInsight(input.item, 'vi'),
      this.localizeInsight(input.item, 'en'),
    ]);
    await this.prisma.insight.create({
      data: {
        type: importance >= 0.75 ? InsightType.ALERT : InsightType.SUMMARY,
        title: input.item.title,
        content: input.item.description || input.item.title,
        language: 'vi',
        importanceScore: importance,
        confidenceScore: 1,
        modelProvider: 'source-extractive',
        modelName: 'rss-v1',
        promptVersion: 'none',
        metadata: {
          sourceName: input.item.sourceName,
          sourceUrl: input.item.sourceUrl ?? input.item.link,
          articleUrl: input.item.link,
          suggestedAction: 'Open source',
        },
        insightEvents: { create: { eventId: event.id } },
        userInsights: {
          create: {
            userId: input.userId,
            interestId: input.interestId,
            relevanceScore: 1,
            matchedReason: { reason: `Matched your tracked topic through its RSS search: ${input.item.title}` },
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
          })),
        },
      },
    });
    return { eventCreated: !existing, insightCreated: true };
  }

  private async localizeInsight(item: FeedItem, locale: SupportedLocale): Promise<LocalizedInsight> {
    const [titleResult, contentResult] = await Promise.all([
      this.translate(item.title, locale),
      this.translate(item.description || item.title, locale),
    ]);
    const title = titleResult.text;
    const content = contentResult.text;
    return {
      locale,
      title,
      content,
      relevanceReason: locale === 'vi'
        ? `Nội dung này liên quan đến chủ đề anh đang theo dõi: ${title}`
        : `This is relevant to a topic you are tracking: ${title}`,
      suggestedAction: locale === 'vi' ? 'Mở bài viết gốc' : 'Open source',
      provider: titleResult.provider === 'fallback-original' || contentResult.provider === 'fallback-original'
        ? 'fallback-original'
        : titleResult.provider === 'mymemory' || contentResult.provider === 'mymemory'
          ? 'mymemory'
          : 'source-original',
    };
  }

  private async ensureLocalizations(insightId: string, item: FeedItem): Promise<void> {
    const existing = await this.prisma.insightLocalization.findMany({
      where: { insightId },
      select: { locale: true, provider: true },
    });
    const sourceLanguage = this.detectLanguage(`${item.title} ${item.description}`);
    const retryLocales = new Set(existing
      .filter((value) => value.provider === 'fallback-original'
        || value.provider === 'google-translate'
        || (value.provider === 'source-original' && value.locale !== sourceLanguage))
      .map((value) => value.locale));
    const existingLocales = new Set(existing.map((value) => value.locale));
    const required = (['vi', 'en'] as const).filter((locale) => !existingLocales.has(locale) || retryLocales.has(locale));
    const localizations = await Promise.all(required.map((locale) => this.localizeInsight(item, locale)));
    if (localizations.length === 0) return;
    await Promise.all(localizations.map((localized) => this.prisma.insightLocalization.upsert({
      where: { insightId_locale: { insightId, locale: localized.locale } },
      update: {
        title: localized.title,
        content: localized.content,
        relevanceReason: localized.relevanceReason,
        suggestedAction: localized.suggestedAction,
        provider: localized.provider,
      },
      create: {
        insightId,
        locale: localized.locale,
        title: localized.title,
        content: localized.content,
        relevanceReason: localized.relevanceReason,
        suggestedAction: localized.suggestedAction,
        provider: localized.provider,
      },
    })));
  }

  private async translate(value: string, target: SupportedLocale): Promise<{ text: string; provider: string }> {
    const source = this.detectLanguage(value);
    if (source === target) return { text: value, provider: 'source-original' };
    try {
      const parameters = new URLSearchParams({ q: value, langpair: `${source}|${target}` });
      const response = await fetch(`https://api.mymemory.translated.net/get?${parameters.toString()}`, {
        headers: { 'User-Agent': 'NoraBot/0.1 (+local-development)' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`translation returned HTTP ${response.status}`);
      const payload = await response.json() as { responseData?: { translatedText?: string } };
      const translated = payload.responseData?.translatedText?.trim();
      return translated ? { text: translated, provider: 'mymemory' } : { text: value, provider: 'fallback-original' };
    } catch (error) {
      this.logger.warn(`Translation to ${target} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { text: value, provider: 'fallback-original' };
    }
  }

  private detectLanguage(value: string): SupportedLocale {
    const vietnameseCharacters = value.match(/[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/gi)?.length ?? 0;
    return vietnameseCharacters >= 3 ? 'vi' : 'en';
  }

  private async rebuildTodayBrief(userId: string): Promise<string | null> {
    const briefDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
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
    const relevantCandidates = candidates.filter((candidate) => {
      const event = candidate.insight.insightEvents[0]?.event;
      return Boolean(event && candidate.interest && this.matchesInterest(candidate.interest.name, `${event.title} ${event.content}`));
    });
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
    await Promise.all(rows.map(async (row) => {
      const event = row.insight.insightEvents[0]?.event;
      if (!event) return;
      const metadata = this.object(event.metadata);
      await this.ensureLocalizations(row.insightId, {
        title: event.title,
        description: event.content,
        link: event.url ?? '',
        guid: event.externalId,
        publishedAt: event.publishedAt,
        sourceName: event.author ?? 'Google News',
        sourceUrl: typeof metadata.sourceUrl === 'string' ? metadata.sourceUrl : undefined,
      });
    }));
    await this.prisma.dailyBrief.deleteMany({ where: { userId, briefDate } });
    const brief = await this.prisma.dailyBrief.create({
      data: {
        userId,
        briefDate,
        timezone: 'Asia/Ho_Chi_Minh',
        status: DailyBriefStatus.READY,
        title: `${rows.length} real updates from your tracked topics`,
        summary: 'Built from source-linked events.',
        generatedAt: new Date(),
        metadata: { pipeline: 'rss-v1', sourceLinked: true },
        items: {
          create: rows.map((row, position) => ({
            userInsightId: row.id,
            position,
            section: Number(row.insight.importanceScore) >= 0.75 ? 'important' : 'other',
            title: row.insight.title,
            content: row.insight.content,
            metadata: { sourceLinked: true },
          })),
        },
      },
    });
    return brief.id;
  }

  private importance(publishedAt: Date): number {
    const ageHours = Math.max(0, (Date.now() - publishedAt.getTime()) / 3_600_000);
    if (ageHours <= 6) return 0.82;
    if (ageHours <= 24) return 0.72;
    return 0.58;
  }

  private clean(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
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

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US');
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    const object = this.object(value);
    return typeof object['#text'] === 'string' ? object['#text'] : '';
  }
}
