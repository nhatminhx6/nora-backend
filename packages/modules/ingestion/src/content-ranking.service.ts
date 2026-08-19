import { Injectable } from '@nestjs/common';
import { ContentAudienceMatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';

export const RANKING_POLICY_V1 = 'content-ranking-v1';
export const RANKING_WEIGHTS_V1 = {
  interestRelevance: 0.22,
  entityRelevance: 0.12,
  sourceAuthority: 0.13,
  importance: 0.14,
  freshness: 0.11,
  homeMarketAffinity: 0.09,
  followedMarketAffinity: 0.05,
  novelty: 0.08,
  duplicatePenalty: 0.18,
  stalePenalty: 0.12,
  alreadySeenPenalty: 0.15,
} as const;

export interface RankingBreakdownV1 {
  version: typeof RANKING_POLICY_V1;
  components: Record<keyof typeof RANKING_WEIGHTS_V1, number>;
  score: number;
}

export function rankingScore(input: {
  relevanceScore: number;
  entityMatches: number;
  authority: number;
  importance: number;
  publishedAt: Date;
  now: Date;
  markets: string[];
  homeMarket: string;
  followedMarkets: string[];
  duplicate: boolean;
  alreadySeen: boolean;
}): RankingBreakdownV1 {
  const ageHours = Math.max(0, (input.now.getTime() - input.publishedAt.getTime()) / 3_600_000);
  const freshness = Math.max(0, 1 - ageHours / 72);
  const stale = ageHours > 168 ? 1 : 0;
  const values = {
    interestRelevance: clamp(input.relevanceScore),
    entityRelevance: Math.min(1, input.entityMatches / 2),
    sourceAuthority: clamp(input.authority),
    importance: clamp(input.importance),
    freshness,
    homeMarketAffinity: input.markets.includes(input.homeMarket) ? 1 : 0,
    followedMarketAffinity: input.markets.some((market) => input.followedMarkets.includes(market))
      ? 1
      : 0,
    novelty: input.alreadySeen ? 0 : 1,
    duplicatePenalty: input.duplicate ? 1 : 0,
    stalePenalty: stale,
    alreadySeenPenalty: input.alreadySeen ? 1 : 0,
  };
  const positive = (
    [
      'interestRelevance',
      'entityRelevance',
      'sourceAuthority',
      'importance',
      'freshness',
      'homeMarketAffinity',
      'followedMarketAffinity',
      'novelty',
    ] as const
  ).reduce((sum, key) => sum + values[key] * RANKING_WEIGHTS_V1[key], 0);
  const negative = (['duplicatePenalty', 'stalePenalty', 'alreadySeenPenalty'] as const).reduce(
    (sum, key) => sum + values[key] * RANKING_WEIGHTS_V1[key],
    0,
  );
  return {
    version: RANKING_POLICY_V1,
    components: values,
    score: Number(Math.max(0, positive - negative).toFixed(6)),
  };
}

export function diversifiedRanking<
  T extends { id: string; score: number; publisher: string; topic: string },
>(items: T[], limit: number, caps = { publisher: 2, topic: 3 }): T[] {
  const sorted = [...items].sort(
    (left, right) => right.score - left.score || left.id.localeCompare(right.id),
  );
  const publishers = new Map<string, number>();
  const topics = new Map<string, number>();
  const selected: T[] = [];
  for (const item of sorted) {
    if (
      (publishers.get(item.publisher) ?? 0) >= caps.publisher ||
      (topics.get(item.topic) ?? 0) >= caps.topic
    )
      continue;
    selected.push(item);
    publishers.set(item.publisher, (publishers.get(item.publisher) ?? 0) + 1);
    topics.set(item.topic, (topics.get(item.topic) ?? 0) + 1);
    if (selected.length === limit) break;
  }
  return selected;
}

@Injectable()
export class ContentRankingService {
  constructor(private readonly prisma: PrismaService) {}
  async rankUser(userId: string, now = new Date()): Promise<{ ranked: number }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const matches = await this.prisma.contentAudienceMatch.findMany({
      where: { userId, status: ContentAudienceMatchStatus.ACTIVE },
      include: { canonicalContent: true },
    });
    for (const match of matches) {
      const reason = jsonRecord(match.matchedReason);
      const metadata = jsonRecord(match.metadata);
      const contentMetadata = jsonRecord(match.canonicalContent.metadata);
      const breakdown = rankingScore({
        relevanceScore: Number(match.relevanceScore),
        entityMatches: stringArray(reason.entities).length,
        authority: Number(match.canonicalContent.authorityScore),
        importance:
          typeof contentMetadata.importanceScore === 'number' ? contentMetadata.importanceScore : 0,
        publishedAt: match.canonicalContent.publishedAt,
        now,
        markets: match.canonicalContent.markets,
        homeMarket: user.homeMarket,
        followedMarkets: user.followedMarkets,
        duplicate: !!match.canonicalContent.duplicateOfId,
        alreadySeen: typeof metadata.seenAt === 'string',
      });
      await this.prisma.contentAudienceMatch.update({
        where: { id: match.id },
        data: {
          rankingScore: breakdown.score,
          metadata: { ...metadata, ranking: breakdown } as unknown as Prisma.InputJsonObject,
        },
      });
    }
    return { ranked: matches.length };
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
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
