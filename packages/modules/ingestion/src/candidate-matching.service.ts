import { Injectable } from '@nestjs/common';
import {
  ContentAudienceMatchStatus,
  InterestStatus,
  Prisma,
  UserStatus,
  WatchRuleStatus,
  WatchRuleType,
} from '@prisma/client';
import { PrismaService } from '@nora/database';

export const MATCHING_POLICY_V1 = 'candidate-matching-v1';

export interface MatchedReasonV1 {
  version: typeof MATCHING_POLICY_V1;
  topicKeys: string[];
  entities: string[];
  keywords: string[];
  markets: string[];
  globallyImportant: boolean;
}

export function candidateReasons(input: {
  contentTopics: string[];
  contentEntities: string[];
  contentMarkets: string[];
  text: string;
  interestTopics: string[];
  interestEntities: string[];
  watchKeywords: string[];
  homeMarket: string;
  followedMarkets: string[];
  importance: number;
}): MatchedReasonV1 {
  const topicKeys = overlap(input.contentTopics, input.interestTopics);
  const entities = overlap(input.contentEntities, input.interestEntities);
  const normalizedText = normalize(input.text);
  const keywords = [...new Set(input.watchKeywords)].filter((keyword) =>
    normalizedText.includes(normalize(keyword)),
  );
  const preferredMarkets = new Set([input.homeMarket, ...input.followedMarkets]);
  const markets = input.contentMarkets.filter((market) => preferredMarkets.has(market));
  return {
    version: MATCHING_POLICY_V1,
    topicKeys,
    entities,
    keywords,
    markets,
    globallyImportant: input.importance >= 0.8,
  };
}

export function isCandidate(reason: MatchedReasonV1): boolean {
  return (
    reason.globallyImportant ||
    reason.topicKeys.length > 0 ||
    reason.entities.length > 0 ||
    reason.keywords.length > 0 ||
    reason.markets.length > 0
  );
}

@Injectable()
export class CandidateMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async matchCanonicalContent(
    canonicalContentId: string,
  ): Promise<{ matched: number; skipped: number }> {
    const content = await this.prisma.canonicalContent.findUniqueOrThrow({
      where: { id: canonicalContentId },
      include: { claims: true, clusterMemberships: { select: { clusterId: true }, take: 1 } },
    });
    const contentEntities = [...new Set(content.claims.flatMap((claim) => claim.entities))];
    const metadata = jsonRecord(content.metadata);
    const importance =
      typeof metadata.importanceScore === 'number'
        ? metadata.importanceScore
        : Number(content.authorityScore) * (content.sourceTier === 1 ? 1 : 0.75);
    const users = await this.prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      include: {
        interests: {
          where: { status: InterestStatus.ACTIVE },
          include: { interestEntities: { include: { entity: true } } },
        },
        watchRules: { where: { status: WatchRuleStatus.ACTIVE, type: WatchRuleType.KEYWORD } },
      },
    });
    let matched = 0;
    let skipped = 0;
    for (const user of users) {
      const reason = candidateReasons({
        contentTopics: content.topics,
        contentEntities,
        contentMarkets: content.markets,
        text: `${content.originalTitle}\n${content.originalContent ?? content.originalExcerpt ?? ''}`,
        interestTopics: user.interests.flatMap((interest) =>
          interest.topicKey ? [interest.topicKey] : [],
        ),
        interestEntities: user.interests.flatMap((interest) =>
          interest.interestEntities.flatMap((link) => [
            link.entity.canonicalName,
            ...link.entity.aliases,
          ]),
        ),
        watchKeywords: user.watchRules.flatMap((rule) => keywordConditions(rule.conditions)),
        homeMarket: user.homeMarket,
        followedMarkets: user.followedMarkets,
        importance,
      });
      if (!isCandidate(reason)) {
        skipped += 1;
        continue;
      }
      const relevanceScore = Math.min(
        1,
        0.25 * reason.topicKeys.length +
          0.3 * reason.entities.length +
          0.35 * reason.keywords.length +
          0.2 * reason.markets.length +
          (reason.globallyImportant ? 0.4 : 0),
      );
      await this.prisma.contentAudienceMatch.upsert({
        where: {
          userId_canonicalContentId_locale_policyVersion: {
            userId: user.id,
            canonicalContentId: content.id,
            locale: user.locale,
            policyVersion: MATCHING_POLICY_V1,
          },
        },
        update: {
          clusterId: content.clusterMemberships[0]?.clusterId,
          relevanceScore,
          matchedReason: reason as unknown as Prisma.InputJsonValue,
          status: ContentAudienceMatchStatus.ACTIVE,
        },
        create: {
          userId: user.id,
          canonicalContentId: content.id,
          clusterId: content.clusterMemberships[0]?.clusterId,
          locale: user.locale,
          policyVersion: MATCHING_POLICY_V1,
          relevanceScore,
          matchedReason: reason as unknown as Prisma.InputJsonValue,
        },
      });
      matched += 1;
    }
    return { matched, skipped };
  }
}

function overlap(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.map(normalize));
  return [...new Set(left.filter((value) => rightSet.has(normalize(value))))];
}
function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').trim();
}
function keywordConditions(value: Prisma.JsonValue): string[] {
  const record = jsonRecord(value);
  const keywords = record.keywords ?? record.keyword;
  if (typeof keywords === 'string') return [keywords];
  return Array.isArray(keywords)
    ? keywords.filter((item): item is string => typeof item === 'string' && !!item.trim())
    : [];
}
function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
