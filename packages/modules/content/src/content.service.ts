import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DailyBriefStatus, EntityType, InsightType, InterestStatus, UserInsightStatus } from '@prisma/client';
import { PrismaService } from '@nora/database';
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
          content: 'Gold prices recorded a notable move. Review the latest market context before making a decision.',
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
          content: 'Trading activity is concentrated in banking stocks, with higher-than-usual attention across the sector.',
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
          content: 'There are updates relevant to mobile and frontend development in your tracked technology topics.',
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

  async getDailyBrief(userId: string, rawDate?: string) {
    const date = this.parseDate(rawDate);
    const brief = await this.prisma.dailyBrief.findFirst({
      where: { userId, briefDate: date, status: DailyBriefStatus.READY },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            userInsight: {
              include: {
                insight: { include: { insightEvents: { include: { event: true } } } },
                interest: true,
              },
            },
          },
        },
      },
    });
    if (!brief) {
      return { brief: null };
    }
    const insights = brief.items.flatMap((item) =>
      item.userInsight ? [this.mapInsight(item.userInsight)] : [],
    );
    const importantInsights = insights.filter((item) => item.type !== 'informational');
    const otherInsights = insights.filter((item) => item.type === 'informational');
    return {
      brief: {
        id: brief.id,
        date: brief.briefDate,
        headline: brief.title,
        importantInsights,
        otherInsights,
        upcomingItems: [],
      },
    };
  }

  async getInterestInsights(userId: string, interestId: string) {
    const interest = await this.prisma.interest.findFirst({
      where: { id: interestId, userId, deletedAt: null },
    });
    if (!interest) {
      throw new NotFoundException({ code: 'INTEREST_NOT_FOUND', message: 'Interest was not found' });
    }
    const rows = await this.prisma.userInsight.findMany({
      where: { userId, interestId },
      orderBy: { createdAt: 'desc' },
      include: {
        insight: { include: { insightEvents: { include: { event: true } } } },
        interest: true,
      },
    });
    return rows.map((row) => this.mapInsight(row));
  }

  async updateUserInsight(userId: string, id: string, dto: UpdateUserInsightDto) {
    const current = await this.prisma.userInsight.findFirst({ where: { id, userId } });
    if (!current) {
      throw new NotFoundException({ code: 'USER_INSIGHT_NOT_FOUND', message: 'Insight was not found' });
    }
    const updated = await this.prisma.userInsight.update({
      where: { id },
      data: {
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.status === 'READ' ? { readAt: new Date(), seenAt: current.seenAt ?? new Date() } : {}),
        matchedReason: {
          ...this.asObject(current.matchedReason),
          ...(dto.isUseful === undefined ? {} : { isUseful: dto.isUseful }),
          ...(dto.isSaved === undefined ? {} : { isSaved: dto.isSaved }),
        },
      },
    });
    return updated;
  }

  private mapInsight(row: any) {
    const config = this.asObject(row.interest?.config);
    const matchedReason = this.asObject(row.matchedReason);
    const metadata = this.asObject(row.insight.metadata);
    const events = row.insight.insightEvents.map((relation: any) => relation.event);
    const firstEvent = events[0];
    return {
      id: row.id,
      topicId: row.interestId,
      topicName: row.interest?.name ?? '',
      category: typeof config.category === 'string' ? config.category : 'other',
      type: this.insightType(row.insight.type, Number(row.insight.importanceScore)),
      title: row.insight.title,
      summary: row.insight.content,
      relevanceReason:
        typeof matchedReason.reason === 'string' ? matchedReason.reason : row.interest?.description ?? '',
      suggestedAction: typeof metadata.suggestedAction === 'string' ? metadata.suggestedAction : null,
      sourceCount: events.length,
      publishedAt: firstEvent?.publishedAt ?? row.insight.generatedAt,
      eventDate: firstEvent?.occurredAt ?? null,
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
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'date must use YYYY-MM-DD format' });
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'date is invalid' });
    }
    return date;
  }

  private asObject(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
