import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  ContentAudienceMatchStatus,
  ContentLocalizationStatus,
  DailyBriefStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@nora/database';
import { diversifiedRanking } from './content-ranking.service';

export const DAILY_BRIEF_POLICY_V2 = 'daily-brief-v2';

export function briefInputVersion(
  items: Array<{ id: string; score: number; localizationUpdatedAt: Date }>,
): string {
  return createHash('sha256')
    .update(
      [...items]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => `${item.id}:${item.score}:${item.localizationUpdatedAt.toISOString()}`)
        .join('|'),
    )
    .digest('hex');
}

@Injectable()
export class DailyBriefV2Service {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    userId: string,
    dateKey: string,
  ): Promise<{ id: string; reused: boolean; itemCount: number }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('BRIEF_DATE_INVALID');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const now = new Date();
    const freshnessStart = new Date(now.getTime() - 7 * 86_400_000);
    const matches = await this.prisma.contentAudienceMatch.findMany({
      where: {
        userId,
        status: ContentAudienceMatchStatus.ACTIVE,
        rankingScore: { not: null },
        canonicalContent: {
          publishedAt: { gte: freshnessStart },
          duplicateOfId: null,
          localizations: {
            some: { locale: user.locale, status: ContentLocalizationStatus.VERIFIED },
          },
        },
      },
      include: {
        canonicalContent: {
          include: {
            localizations: {
              where: { locale: user.locale, status: ContentLocalizationStatus.VERIFIED },
              orderBy: { verifiedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ rankingScore: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    const clusters = new Set<string>();
    const unique = matches.filter((match) => {
      const key = match.clusterId ?? `content:${match.canonicalContentId}`;
      if (clusters.has(key)) return false;
      clusters.add(key);
      return true;
    });
    const selected = diversifiedRanking(
      unique.map((match) => ({
        id: match.id,
        score: Number(match.rankingScore),
        publisher: match.canonicalContent.publisher,
        topic: match.canonicalContent.topics[0] ?? 'other',
        match,
      })),
      10,
      { publisher: 2, topic: 3 },
    );
    const inputVersion = briefInputVersion(
      selected.map(({ match }) => ({
        id: match.id,
        score: Number(match.rankingScore),
        localizationUpdatedAt: match.canonicalContent.localizations[0]!.updatedAt,
      })),
    );
    const briefDate = new Date(`${dateKey}T00:00:00.000Z`);
    const existing = await this.prisma.dailyBrief.findUnique({
      where: { userId_briefDate: { userId, briefDate } },
      include: { items: true },
    });
    if (existing && jsonRecord(existing.metadata).inputVersion === inputVersion)
      return { id: existing.id, reused: true, itemCount: existing.items.length };
    return this.prisma.$transaction(async (tx) => {
      const brief = await tx.dailyBrief.upsert({
        where: { userId_briefDate: { userId, briefDate } },
        update: {
          timezone: user.timezone,
          status: DailyBriefStatus.READY,
          title: title(user.locale, selected.length),
          summary: null,
          generatedAt: now,
          failureCode: null,
          metadata: { policyVersion: DAILY_BRIEF_POLICY_V2, inputVersion, locale: user.locale },
        },
        create: {
          userId,
          briefDate,
          timezone: user.timezone,
          status: DailyBriefStatus.READY,
          title: title(user.locale, selected.length),
          generatedAt: now,
          metadata: { policyVersion: DAILY_BRIEF_POLICY_V2, inputVersion, locale: user.locale },
        },
      });
      await tx.dailyBriefItem.deleteMany({ where: { dailyBriefId: brief.id } });
      if (selected.length)
        await tx.dailyBriefItem.createMany({
          data: selected.map(({ match }, position) => {
            const localization = match.canonicalContent.localizations[0]!;
            const ageMs = now.getTime() - match.canonicalContent.publishedAt.getTime();
            return {
              dailyBriefId: brief.id,
              position,
              section: position < 3 ? 'important' : 'other',
              title: localization.title!,
              content: localization.summary!,
              actionUrl: match.canonicalContent.canonicalUrl,
              metadata: {
                audienceMatchId: match.id,
                canonicalContentId: match.canonicalContentId,
                clusterId: match.clusterId,
                publisher: match.canonicalContent.publisher,
                topic: match.canonicalContent.topics[0] ?? 'other',
                stale: ageMs > 48 * 3_600_000,
                publishedAt: match.canonicalContent.publishedAt.toISOString(),
                qualityStatus: localization.status,
              },
            };
          }),
        });
      return { id: brief.id, reused: false, itemCount: selected.length };
    });
  }
}

function title(locale: string, count: number): string {
  return locale === 'vi'
    ? `${count} cập nhật đáng chú ý hôm nay`
    : `${count} updates worth your attention today`;
}
function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
