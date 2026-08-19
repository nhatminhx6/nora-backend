import { BadRequestException, Injectable } from '@nestjs/common';
import { ContentAudienceMatchStatus, InterestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';
import {
  MATCHING_POLICY_V1,
  candidateReasons,
  isCandidate,
  rankingScore,
} from '@nora/ingestion';
import { TOPIC_CATALOG } from './topic-catalog';

const CATALOG_KEYS = new Set(TOPIC_CATALOG.map((topic) => topic.key));
const MIN_SELECTABLE_ITEMS = 5;
type DatabaseClient = Prisma.TransactionClient;

export interface TopicInventoryItem {
  key: string;
  availableItems: number;
  freshItems: number;
  latestPublishedAt: Date;
  publishers: number;
}

@Injectable()
export class PreparedContentService {
  constructor(private readonly prisma: PrismaService) {}

  async availableTopicKeys(locale: 'vi' | 'en'): Promise<Set<string>> {
    return new Set(
      (await this.topicInventory(locale))
        .filter((item) => item.availableItems >= MIN_SELECTABLE_ITEMS && item.freshItems > 0)
        .map((item) => item.key),
    );
  }

  async topicInventory(locale: 'vi' | 'en', now = new Date()): Promise<TopicInventoryItem[]> {
    const contents = await this.prisma.canonicalContent.findMany({
      where: {
        provenanceStatus: 'VERIFIED',
        duplicateOfId: null,
        localizations: { some: { locale, status: 'VERIFIED' } },
      },
      select: { topics: true, publisher: true, publishedAt: true },
    });
    return buildTopicInventory(contents, now);
  }

  async matchUser(userId: string): Promise<{ matched: number }> {
    return this.matchUserWithClient(this.prisma, userId);
  }

  async replaceSelection(
    userId: string,
    selections: Array<{ key: string; refinements: string[] }>,
  ): Promise<{ selectedTopics: string[]; matchedItems: number }> {
    const normalized = selections.map((selection) => ({
      key: selection.key.trim().toLocaleLowerCase('en-US'),
      refinements: [...new Set(selection.refinements.map((value) => value.trim()).filter(Boolean))],
    }));
    if (new Set(normalized.map((item) => item.key)).size !== normalized.length)
      throw new BadRequestException({ code: 'DUPLICATE_TOPIC_KEY', message: 'topic keys must be unique' });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { interests: { where: { status: InterestStatus.ACTIVE, deletedAt: null } } },
    });
    const locale = user.locale === 'vi' ? 'vi' : 'en';
    const available = await this.availableTopicKeys(locale);
    if (normalized.some((item) => !available.has(item.key)))
      throw new BadRequestException({
        code: 'TOPIC_CONTENT_NOT_AVAILABLE',
        message: 'every selected topic must have published content for the user locale',
      });
    const previous = new Map(
      user.interests.flatMap((interest) =>
        interest.topicKey
          ? [[interest.topicKey, stringArray(jsonRecord(interest.config).refinements)] as const]
          : [],
      ),
    );
    const next = new Map(normalized.map((item) => [item.key, item.refinements]));
    const affectedTopics = [...new Set([...previous.keys(), ...next.keys()])].filter(
      (key) => !sameStrings(previous.get(key) ?? [], next.get(key) ?? []) || !previous.has(key) || !next.has(key),
    );
    return this.prisma.$transaction(async (transaction) => {
      const keys = normalized.map((item) => item.key);
      await transaction.interest.updateMany({
        where: {
          userId,
          topicKey: keys.length ? { notIn: keys } : { not: null },
          status: InterestStatus.ACTIVE,
        },
        data: { status: InterestStatus.ARCHIVED, deletedAt: new Date() },
      });
      for (const selection of normalized) {
        const topic = TOPIC_CATALOG.find((item) => item.key === selection.key)!;
        await transaction.interest.upsert({
          where: { userId_topicKey: { userId, topicKey: selection.key } },
          update: {
            name: topic.names.en,
            normalizedName: normalizeName(topic.names.en),
            description: topic.descriptions.en,
            type: topic.type,
            status: InterestStatus.ACTIVE,
            deletedAt: null,
            config: topicConfig(topic, selection.refinements),
          },
          create: {
            userId,
            topicKey: selection.key,
            name: topic.names.en,
            normalizedName: normalizeName(topic.names.en),
            description: topic.descriptions.en,
            type: topic.type,
            config: topicConfig(topic, selection.refinements),
          },
        });
      }
      const result = await this.matchUserWithClient(transaction, userId, affectedTopics);
      return { selectedTopics: keys, matchedItems: result.matched };
    });
  }

  private async matchUserWithClient(
    client: DatabaseClient,
    userId: string,
    affectedTopics?: string[],
  ): Promise<{ matched: number }> {
    const user = await client.user.findUniqueOrThrow({
      where: { id: userId },
      include: { interests: { where: { status: InterestStatus.ACTIVE, deletedAt: null } } },
    });
    const locale = user.locale === 'vi' ? 'vi' : 'en';
    const interests = user.interests.flatMap((interest) =>
      interest.topicKey ? [interest.topicKey] : [],
    );
    const refinements = user.interests.flatMap((interest) =>
      stringArray(jsonRecord(interest.config).refinements),
    );
    if (affectedTopics?.length === 0) {
      return {
        matched: await client.contentAudienceMatch.count({
          where: { userId, locale, policyVersion: MATCHING_POLICY_V1, status: ContentAudienceMatchStatus.ACTIVE },
        }),
      };
    }
    const contents = interests.length
      ? await client.canonicalContent.findMany({
      where: {
        provenanceStatus: 'VERIFIED',
        duplicateOfId: null,
        AND: [
          { topics: { hasSome: interests } },
          ...(affectedTopics ? [{ topics: { hasSome: affectedTopics } }] : []),
        ],
        localizations: { some: { locale, status: 'VERIFIED' } },
      },
      include: { claims: true, clusterMemberships: { take: 1 } },
    })
      : [];
    await client.contentAudienceMatch.updateMany({
      where: {
        userId,
        locale,
        policyVersion: MATCHING_POLICY_V1,
        ...(affectedTopics
          ? { canonicalContent: { topics: { hasSome: affectedTopics } } }
          : {}),
      },
      data: { status: ContentAudienceMatchStatus.EXPIRED },
    });
    let matched = 0;
    for (const content of contents) {
      const metadata = jsonRecord(content.metadata);
      const importance = numberValue(metadata.importanceScore, Number(content.authorityScore));
      const reason = candidateReasons({
        contentTopics: content.topics,
        contentEntities: [...new Set(content.claims.flatMap((claim) => claim.entities))],
        contentMarkets: content.markets,
        text: `${content.originalTitle}\n${content.originalContent ?? content.originalExcerpt ?? ''}`,
        interestTopics: interests,
        interestEntities: [],
        watchKeywords: refinements,
        homeMarket: user.homeMarket,
        followedMarkets: user.followedMarkets,
        importance,
      });
      if (!isCandidate(reason)) continue;
      const relevanceScore = Math.min(
        1,
        0.4 * reason.topicKeys.length +
          0.35 * reason.keywords.length +
          0.2 * reason.markets.length +
          (reason.globallyImportant ? 0.25 : 0),
      );
      const ranking = rankingScore({
        relevanceScore,
        entityMatches: reason.entities.length,
        authority: Number(content.authorityScore),
        importance,
        publishedAt: content.publishedAt,
        now: new Date(),
        markets: content.markets,
        homeMarket: user.homeMarket,
        followedMarkets: user.followedMarkets,
        duplicate: false,
        alreadySeen: false,
      });
      await client.contentAudienceMatch.upsert({
        where: {
          userId_canonicalContentId_locale_policyVersion: {
            userId,
            canonicalContentId: content.id,
            locale,
            policyVersion: MATCHING_POLICY_V1,
          },
        },
        update: {
          clusterId: content.clusterMemberships[0]?.clusterId,
          relevanceScore,
          rankingScore: ranking.score,
          matchedReason: reason as unknown as Prisma.InputJsonObject,
          status: ContentAudienceMatchStatus.ACTIVE,
          metadata: { ranking } as unknown as Prisma.InputJsonObject,
        },
        create: {
          userId,
          canonicalContentId: content.id,
          clusterId: content.clusterMemberships[0]?.clusterId,
          locale,
          policyVersion: MATCHING_POLICY_V1,
          relevanceScore,
          rankingScore: ranking.score,
          matchedReason: reason as unknown as Prisma.InputJsonObject,
          metadata: { ranking } as unknown as Prisma.InputJsonObject,
        },
      });
      matched += 1;
    }
    const profileData = jsonRecord(user.profileData);
    await client.user.update({
      where: { id: userId },
      data: {
        profileData: { ...profileData, contentFeedVersion: 'v2' } as Prisma.InputJsonObject,
      },
    });
    return { matched };
  }

  async reclassifyLegacyTopics(actor: string): Promise<{ scanned: number; updated: number }> {
    if (!actor.trim()) throw new Error('PREPARE_ACTOR_REQUIRED');
    const contents = await this.prisma.canonicalContent.findMany({ select: { id: true, topics: true, metadata: true } });
    let updated = 0;
    for (const content of contents) {
      const eventId = stringValue(jsonRecord(content.metadata).legacyEventId);
      if (!eventId) continue;
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: {
          insightEvents: {
            include: { insight: { include: { userInsights: { include: { interest: true } } } } },
          },
        },
      });
      const topics = [...new Set(
        (event?.insightEvents ?? [])
          .flatMap((link) => link.insight.userInsights)
          .flatMap((entry) => entry.interest?.topicKey ? [catalogTopic(entry.interest.topicKey)] : [])
          .filter((key): key is string => !!key),
      )];
      if (!topics.length || sameStrings(topics, content.topics)) continue;
      await this.prisma.canonicalContent.update({ where: { id: content.id }, data: { topics } });
      updated += 1;
    }
    await this.prisma.pipelineRun.create({
      data: {
        pipeline: 'PREPARE_TOPICS',
        status: 'COMPLETED',
        processedCount: updated,
        completedAt: new Date(),
        metadata: { actor, scanned: contents.length, version: 'legacy-topic-map-v1' },
      },
    });
    return { scanned: contents.length, updated };
  }
}

export function catalogTopic(value: string): string | null {
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (CATALOG_KEYS.has(normalized)) return normalized;
  if (['openai', 'apple'].includes(normalized)) return 'technology';
  if (normalized === 'bitcoin') return 'markets';
  return null;
}
function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function numberValue(value: unknown, fallback: number): number { return typeof value === 'number' ? value : fallback; }
function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);
}
function normalizeName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}
function topicConfig(topic: (typeof TOPIC_CATALOG)[number], refinements: string[]): Prisma.InputJsonObject {
  return {
    topicKey: topic.key,
    category: topic.category,
    refinements,
    queryTerms: [topic.names.en, ...refinements],
  };
}
export function buildTopicInventory(
  contents: Array<{ topics: string[]; publisher: string; publishedAt: Date }>,
  now = new Date(),
): TopicInventoryItem[] {
  const result = new Map<string, { dates: Date[]; publishers: Set<string> }>();
  for (const content of contents)
    for (const key of content.topics) {
      if (!CATALOG_KEYS.has(key)) continue;
      const item = result.get(key) ?? { dates: [], publishers: new Set<string>() };
      item.dates.push(content.publishedAt);
      item.publishers.add(content.publisher);
      result.set(key, item);
    }
  return [...result.entries()].map(([key, value]) => ({
    key,
    availableItems: value.dates.length,
    freshItems: value.dates.filter((date) => now.getTime() - date.getTime() <= 7 * 86_400_000).length,
    latestPublishedAt: new Date(Math.max(...value.dates.map((date) => date.getTime()))),
    publishers: value.publishers.size,
  })).sort((left, right) => right.availableItems - left.availableItems || left.key.localeCompare(right.key));
}
