import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DailyBriefStatus,
  EntityType,
  InsightType,
  InterestStatus,
  UserInsightStatus,
} from '@prisma/client';
import { PrismaService } from '@nora/database';
import { categoryLabel } from '@nora/interests/topic-catalog';
import { UpdateUserInsightDto } from './update-user-insight.dto';

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async seedDevelopmentData(userId: string, rawDate?: string) {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException({ code: 'ROUTE_NOT_FOUND', message: 'Route was not found' });
    }
    const date = this.parseDate(rawDate);
    const existing = await this.prisma.dailyBrief.findUnique({
      where: { userId_briefDate: { userId, briefDate: date } },
      select: { id: true },
    });
    if (existing) {
      return { seeded: false, briefId: existing.id, reason: 'BRIEF_ALREADY_EXISTS' };
    }

    const seeds = [
      {
        interest: { name: 'Gold market', type: EntityType.TOPIC, category: 'investments' },
        insight: {
          type: InsightType.ALERT,
          title: 'Gold moved sharply today',
          content:
            'Gold prices recorded a notable move. Review the latest market context before making a decision.',
          importance: 0.86,
          reason: 'You asked Nora to follow gold and investment opportunities.',
          action: 'Review market context',
        },
      },
      {
        interest: { name: 'Vietnam stock market', type: EntityType.STOCK, category: 'investments' },
        insight: {
          type: InsightType.TREND,
          title: 'Banking stocks are driving market activity',
          content:
            'Trading activity is concentrated in banking stocks, with higher-than-usual attention across the sector.',
          importance: 0.72,
          reason: 'This matches your interest in stocks and financial markets.',
          action: 'Open tracked topic',
        },
      },
      {
        interest: { name: 'Mobile development', type: EntityType.TECHNOLOGY, category: 'work' },
        insight: {
          type: InsightType.SUMMARY,
          title: 'Your mobile development brief is ready',
          content:
            'There are updates relevant to mobile and frontend development in your tracked technology topics.',
          importance: 0.55,
          reason: 'Your profile says you work in mobile and frontend development.',
          action: 'View details',
        },
      },
    ];

    return this.prisma.$transaction(async (transaction) => {
      const userInsightIds: string[] = [];
      for (const seed of seeds) {
        const normalizedName = seed.interest.name.toLocaleLowerCase('en-US');
        const interest = await transaction.interest.upsert({
          where: { userId_normalizedName: { userId, normalizedName } },
          update: { status: InterestStatus.ACTIVE, deletedAt: null },
          create: {
            userId,
            name: seed.interest.name,
            normalizedName,
            type: seed.interest.type,
            config: {
              category: seed.interest.category,
              relationship: 'learning',
              priority: seed.insight.importance >= 0.7 ? 'high' : 'standard',
              trackingRules: [],
              notificationMode: 'dailyBrief',
            },
          },
        });
        const insight = await transaction.insight.create({
          data: {
            type: seed.insight.type,
            title: seed.insight.title,
            content: seed.insight.content,
            language: 'en',
            importanceScore: seed.insight.importance,
            confidenceScore: 0.9,
            metadata: { suggestedAction: seed.insight.action, developmentSeed: true },
          },
        });
        const userInsight = await transaction.userInsight.create({
          data: {
            userId,
            interestId: interest.id,
            insightId: insight.id,
            relevanceScore: seed.insight.importance,
            matchedReason: { reason: seed.insight.reason },
          },
        });
        userInsightIds.push(userInsight.id);
      }

      const brief = await transaction.dailyBrief.create({
        data: {
          userId,
          briefDate: date,
          timezone: 'Asia/Ho_Chi_Minh',
          status: DailyBriefStatus.READY,
          title: '3 updates worth your attention today',
          summary: 'Development seed data for validating Nora mobile screens.',
          generatedAt: new Date(),
          metadata: { developmentSeed: true },
          items: {
            create: userInsightIds.map((userInsightId, position) => ({
              userInsightId,
              position,
              section: position < 2 ? 'important' : 'other',
              title: seeds[position]!.insight.title,
              content: seeds[position]!.insight.content,
              metadata: { developmentSeed: true },
            })),
          },
        },
      });
      return { seeded: true, briefId: brief.id, interests: seeds.length, insights: seeds.length };
    });
  }

  async getHomeFeed(userId: string, rawLocale?: string, rawCategory?: string, rawPage?: string) {
    const locale = this.parseLocale(rawLocale);
    const category = rawCategory?.trim() || 'all';
    const page = this.parsePage(rawPage);
    const pageSize = 20;
    const interests = await this.prisma.interest.findMany({
      where: { userId, status: InterestStatus.ACTIVE, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, config: true },
    });
    const interestCategories = new Map(
      interests.map((interest) => {
        const value = this.asObject(interest.config).category;
        return [interest.id, typeof value === 'string' ? value : 'other'] as const;
      }),
    );
    const categories = [...new Set(interestCategories.values())];
    if (category !== 'all' && !categories.includes(category)) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY',
        message: 'category must be all or one of the user onboarding categories',
      });
    }
    const selectedInterestIds = interests
      .filter((interest) => category === 'all' || interestCategories.get(interest.id) === category)
      .map((interest) => interest.id);
    if (selectedInterestIds.length === 0) return { brief: null };

    const visibleWhere = {
      userId,
      status: { not: UserInsightStatus.DISMISSED },
      interestId: { in: selectedInterestIds },
      insight: { insightEvents: { some: { event: { status: 'PROCESSED' as const } } } },
    };
    const allInterestIds = interests.map((interest) => interest.id);
    const countsByInterest = await this.prisma.userInsight.groupBy({
      by: ['interestId'],
      orderBy: { interestId: 'asc' },
      where: {
        userId,
        status: { not: UserInsightStatus.DISMISSED },
        interestId: { in: allInterestIds },
        insight: { insightEvents: { some: { event: { status: 'PROCESSED' as const } } } },
      },
      _count: { interestId: true },
    });
    const [rows, total, latestBrief] = await this.prisma.$transaction([
      this.prisma.userInsight.findMany({
        where: visibleWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          insight: {
            include: {
              localizations: { where: { locale } },
              insightEvents: { include: { event: true } },
            },
          },
          interest: true,
        },
      }),
      this.prisma.userInsight.count({ where: visibleWhere }),
      this.prisma.dailyBrief.findFirst({
        where: { userId, status: DailyBriefStatus.READY },
        orderBy: [{ briefDate: 'desc' }, { generatedAt: 'desc' }],
        select: { id: true, briefDate: true },
      }),
    ]);
    const insights = rows.map((row) => this.mapInsight(row, locale));
    const importantInsights = insights.filter((item) => item.type !== 'informational');
    const otherInsights = insights.filter((item) => item.type === 'informational');
    const counts = new Map<string, number>();
    for (const row of countsByInterest) {
      if (!row.interestId) continue;
      const itemCategory = interestCategories.get(row.interestId) ?? 'other';
      counts.set(itemCategory, (counts.get(itemCategory) ?? 0) + row._count.interestId);
    }
    const allCount = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const filters = [
      { key: 'all', title: locale === 'vi' ? 'Tất cả' : 'All', count: allCount },
      ...categories.map((item) => ({
        key: item,
        title: categoryLabel(item, locale),
        count: counts.get(item) ?? 0,
      })),
    ];
    return {
      brief: {
        id: latestBrief?.id ?? userId,
        date: latestBrief?.briefDate ?? new Date(),
        headline:
          locale === 'vi'
            ? `${allCount} cập nhật từ các chủ đề anh theo dõi`
            : `${allCount} updates from tracked topics`,
        importantInsights,
        otherInsights,
        upcomingItems: [],
        filters,
        groups: [],
        selectedCategory: category,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNextPage: page * pageSize < total,
        },
      },
    };
  }

  async getInterestInsights(userId: string, interestId: string, rawLocale?: string) {
    const locale = this.parseLocale(rawLocale);
    const interest = await this.prisma.interest.findFirst({
      where: { id: interestId, userId, deletedAt: null },
    });
    if (!interest) {
      throw new NotFoundException({
        code: 'INTEREST_NOT_FOUND',
        message: 'Interest was not found',
      });
    }
    const rows = await this.prisma.userInsight.findMany({
      where: { userId, interestId },
      orderBy: { createdAt: 'desc' },
      include: {
        insight: {
          include: {
            localizations: { where: { locale } },
            insightEvents: { include: { event: true } },
          },
        },
        interest: true,
      },
    });
    return rows.map((row) => this.mapInsight(row, locale));
  }

  async updateUserInsight(userId: string, id: string, dto: UpdateUserInsightDto) {
    const current = await this.prisma.userInsight.findFirst({ where: { id, userId } });
    if (!current) {
      throw new NotFoundException({
        code: 'USER_INSIGHT_NOT_FOUND',
        message: 'Insight was not found',
      });
    }
    const updated = await this.prisma.userInsight.update({
      where: { id },
      data: {
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.status === 'READ'
          ? { readAt: new Date(), seenAt: current.seenAt ?? new Date() }
          : {}),
        matchedReason: {
          ...this.asObject(current.matchedReason),
          ...(dto.isUseful === undefined ? {} : { isUseful: dto.isUseful }),
          ...(dto.isSaved === undefined ? {} : { isSaved: dto.isSaved }),
        },
      },
    });
    return updated;
  }

  private mapInsight(row: any, locale: 'vi' | 'en') {
    const config = this.asObject(row.interest?.config);
    const matchedReason = this.asObject(row.matchedReason);
    const metadata = this.asObject(row.insight.metadata);
    const events = row.insight.insightEvents.map((relation: any) => relation.event);
    const firstEvent = events[0];
    const eventMetadata = this.asObject(firstEvent?.metadata);
    const localization = row.insight.localizations?.[0];
    const servedLocale = localization ? locale : (row.insight.language ?? 'unknown');
    const publishedAt = firstEvent?.publishedAt ?? row.insight.generatedAt;
    const ageHours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
    return {
      id: row.id,
      topicId: row.interestId,
      topicName: row.interest?.name ?? '',
      category: typeof config.category === 'string' ? config.category : 'other',
      type: this.insightType(row.insight.type, Number(row.insight.importanceScore)),
      title: localization?.title ?? row.insight.title,
      summary: localization?.content ?? row.insight.content,
      relevanceReason:
        localization?.relevanceReason ??
        (typeof matchedReason.reason === 'string' && !/^[a-z0-9_]+$/i.test(matchedReason.reason)
          ? matchedReason.reason
          : locale === 'vi'
            ? `Tin này liên quan đến chủ đề ${row.interest?.name ?? 'anh đang theo dõi'}.`
            : `This update is relevant to ${row.interest?.name ?? 'a topic you track'}.`),
      suggestedAction:
        localization?.suggestedAction ??
        (typeof metadata.suggestedAction === 'string' ? metadata.suggestedAction : null),
      sourceCount: events.length,
      sourceName:
        typeof eventMetadata.sourceName === 'string'
          ? eventMetadata.sourceName
          : (firstEvent?.author ?? null),
      sourceUrl: firstEvent?.url ?? null,
      publishedAt,
      eventDate: firstEvent?.occurredAt ?? null,
      freshness: {
        ageHours: Number(ageHours.toFixed(1)),
        publishedWithin48Hours: ageHours <= 48,
        fallbackWindow: ageHours > 48 ? '7d' : null,
      },
      localization: {
        requestedLocale: locale,
        servedLocale,
        fallback: !localization,
        validationStatus: localization?.validationStatus ?? null,
        qualityScore:
          localization?.qualityScore === undefined ? null : Number(localization.qualityScore),
      },
      isRead: row.status === UserInsightStatus.READ,
      isSaved: Boolean(matchedReason.isSaved),
    };
  }

  private insightType(type: string, importance: number): string {
    if (type === 'ALERT' && importance >= 0.8) return 'actionRequired';
    if (type === 'ALERT' || importance >= 0.65) return 'important';
    return 'informational';
  }

  private parseDate(rawDate?: string): Date {
    const value = rawDate ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'date must use YYYY-MM-DD format',
      });
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'date is invalid' });
    }
    return date;
  }

  private parseLocale(rawLocale?: string): 'vi' | 'en' {
    if (rawLocale !== 'vi' && rawLocale !== 'en') {
      throw new BadRequestException({
        code: 'INVALID_LOCALE',
        message: 'locale is required and must be either vi or en',
      });
    }
    return rawLocale;
  }

  private parsePage(rawPage?: string): number {
    const page = Number(rawPage ?? '1');
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException({
        code: 'INVALID_PAGE',
        message: 'page must be an integer greater than or equal to 1',
      });
    }
    return page;
  }

  private asObject(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
