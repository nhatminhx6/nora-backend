import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ContentAudienceMatchStatus,
  ContentLocalizationStatus,
  ContentProvenanceStatus,
  Prisma,
} from '@prisma/client';
import { isKnownLocale } from '@nora/common';
import { PrismaService } from '@nora/database';
import { accountFeedV2Enabled, diversifiedRanking, globalFeedV2Enabled } from '@nora/ingestion';

@Injectable()
export class FeedV2Service {
  constructor(private readonly prisma: PrismaService) {}

  async getFeed(userId: string, rawLocale?: string, rawCursor?: string, rawLimit?: string) {
    if (!isKnownLocale(rawLocale) || rawLocale === 'zh-Hans')
      throw new BadRequestException({
        code: 'INVALID_LOCALE',
        message: 'locale is required and must be either vi or en',
      });
    const limit = parseLimit(rawLimit);
    const cursor = decodeCursor(rawCursor);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!globalFeedV2Enabled() || !accountFeedV2Enabled(user.profileData))
      throw new BadRequestException({
        code: 'FEED_V2_NOT_ENABLED',
        message: 'feed v2 is not enabled for this account',
      });
    const matches = await this.prisma.contentAudienceMatch.findMany({
      where: {
        userId,
        locale: rawLocale,
        status: ContentAudienceMatchStatus.ACTIVE,
        rankingScore: { not: null },
        canonicalContent: {
          provenanceStatus: ContentProvenanceStatus.VERIFIED,
          duplicateOfId: null,
          localizations: {
            some: { locale: rawLocale, status: ContentLocalizationStatus.VERIFIED },
          },
        },
      },
      include: {
        canonicalContent: {
          include: {
            localizations: {
              where: { locale: rawLocale, status: ContentLocalizationStatus.VERIFIED },
              orderBy: { verifiedAt: 'desc' },
              take: 1,
            },
            clusterMemberships: {
              include: { cluster: { include: { _count: { select: { members: true } } } } },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ rankingScore: 'desc' }, { id: 'asc' }],
      take: 500,
    });
    const onePerCluster = new Map<string, (typeof matches)[number]>();
    for (const match of matches) {
      const key = match.clusterId ?? `content:${match.canonicalContentId}`;
      if (!onePerCluster.has(key)) onePerCluster.set(key, match);
    }
    const diversified = diversifiedRanking(
      [...onePerCluster.values()].map((match) => ({
        id: match.id,
        score: Number(match.rankingScore),
        publisher: match.canonicalContent.publisher,
        topic: match.canonicalContent.topics[0] ?? 'other',
        match,
      })),
      500,
      { publisher: 4, topic: 8 },
    );
    const start = cursor
      ? diversified.findIndex(
          (item) => item.id === cursor.id && Number(item.score.toFixed(6)) === cursor.score,
        ) + 1
      : 0;
    if (cursor && start === 0)
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'cursor is invalid or expired',
      });
    const page = diversified.slice(start, start + limit);
    const hasNextPage = start + limit < diversified.length;
    const items = page.map(({ match }) => mapItem(match, rawLocale));
    return {
      items,
      importantInsights: items.filter((item) => item.type !== 'informational'),
      otherInsights: items.filter((item) => item.type === 'informational'),
      pagination: {
        pageSize: limit,
        hasNextPage,
        nextCursor:
          hasNextPage && page.length
            ? encodeCursor(page.at(-1)!.id, page.at(-1)!.score)
            : null,
      },
    };
  }
}

function mapItem(match: any, requestedLocale: 'vi' | 'en') {
  const content = match.canonicalContent;
  const localization = content.localizations[0];
  const clusterMembership = content.clusterMemberships[0];
  const importance = Number(jsonRecord(content.metadata).importanceScore ?? 0);
  return {
    id: match.id,
    topicId: match.canonicalContentId,
    topicName: content.topics[0] ?? '',
    category: appCategory(content.topics),
    type: importance >= 0.8 ? 'important' : 'informational',
    title: localization.title,
    summary: localization.summary,
    relevanceReason: relevanceReason(match.matchedReason, requestedLocale),
    suggestedAction: null,
    sourceCount: clusterMembership?.cluster?._count?.members ?? 1,
    sourceName: content.publisher,
    sourceUrl: content.canonicalUrl,
    publisher: content.publisher,
    publishedAt: content.publishedAt,
    eventDate: null,
    markets: content.markets,
    isRead: false,
    isSaved: false,
    freshness: {
      ageHours: Number(
        Math.max(0, (Date.now() - new Date(content.publishedAt).getTime()) / 3_600_000).toFixed(1),
      ),
      stale: Date.now() - new Date(content.publishedAt).getTime() > 7 * 86_400_000,
    },
    localization: {
      requestedLocale,
      servedLocale: requestedLocale,
      fallback: false,
      sourceLanguage: content.sourceLanguage,
      markets: content.markets,
      publisher: content.publisher,
      sourceUrl: content.canonicalUrl,
      publishedAt: content.publishedAt,
      localizedAt: localization.verifiedAt ?? localization.generatedAt,
      sourceCount: clusterMembership?.cluster?._count?.members ?? 1,
      qualityStatus: localization.status,
      qualityScore: localization.qualityScore === null ? null : Number(localization.qualityScore),
    },
  };
}

function relevanceReason(value: Prisma.JsonValue, locale: 'vi' | 'en'): string {
  const reason = jsonRecord(value);
  const topics = stringArray(reason.topicKeys);
  const entities = stringArray(reason.entities);
  const matched = entities[0] ?? topics[0];
  return matched
    ? locale === 'vi'
      ? `Phù hợp vì anh theo dõi ${matched}.`
      : `Relevant because you follow ${matched}.`
    : locale === 'vi'
      ? 'Nội dung quan trọng toàn cầu.'
      : 'Globally important content.';
}
function appCategory(topics: string[]): string {
  if (topics.some((topic) => /^(economy|finance|investments)$/iu.test(topic))) return 'investments';
  if (topics.some((topic) => /^(technology|work|jobs)$/iu.test(topic))) return 'work';
  if (topics.includes('health')) return 'health';
  if (topics.includes('sports')) return 'sports';
  if (topics.includes('travel')) return 'travel';
  if (topics.some((topic) => /^(entertainment|movies)$/iu.test(topic))) return 'entertainment';
  return 'other';
}
function parseLimit(value?: string): number {
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50)
    throw new BadRequestException({
      code: 'INVALID_PAGE_SIZE',
      message: 'limit must be an integer from 1 to 50',
    });
  return parsed;
}
function encodeCursor(id: string, score: number): string {
  return Buffer.from(JSON.stringify({ id, score: Number(score.toFixed(6)) }), 'utf8').toString(
    'base64url',
  );
}
function decodeCursor(value?: string): { id: string; score: number } | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
      return { id: '', score: Number.NaN };
    const record = decoded as Record<string, unknown>;
    return typeof record.id === 'string' &&
      /^[0-9a-f-]{36}$/i.test(record.id) &&
      typeof record.score === 'number' &&
      Number.isFinite(record.score)
      ? { id: record.id, score: record.score }
      : { id: '', score: Number.NaN };
  } catch {
    return { id: '', score: Number.NaN };
  }
}
function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
