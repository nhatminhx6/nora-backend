import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  CanonicalContent,
  ContentClusterStatus,
  ContentProvenanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@nora/database';
import { extractEntities, extractFacts } from './deterministic-claim-extractor.service';

export const CLUSTER_POLICY_V1 = 'entity-facts-title-v1';

interface ClusterFeatures {
  entities: string[];
  topics: string[];
  protectedValues: string[];
  titleTokens: string[];
  eventDay: string;
}

@Injectable()
export class ContentClusteringService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(canonicalContentId: string, policyVersion = CLUSTER_POLICY_V1) {
    const content = await this.prisma.canonicalContent.findUniqueOrThrow({
      where: { id: canonicalContentId },
      include: { claims: true, source: { select: { config: true } } },
    });
    if (content.provenanceStatus !== ContentProvenanceStatus.VERIFIED || content.duplicateOfId)
      throw new Error('CONTENT_NOT_CLUSTER_ELIGIBLE');
    const features = clusterFeatures(content);
    const clusters = await this.prisma.contentCluster.findMany({
      where: {
        status: ContentClusterStatus.ACTIVE,
        policyVersion,
        eventStartedAt: {
          gte: new Date(content.publishedAt.getTime() - 86_400_000),
          lte: new Date(content.publishedAt.getTime() + 86_400_000),
        },
      },
      include: { members: { include: { canonicalContent: true } } },
    });
    const ranked = clusters
      .map((cluster) => ({ cluster, score: clusterSimilarity(features, cluster) }))
      .filter((item) => item.score >= 0.65)
      .sort(
        (left, right) =>
          right.score - left.score || left.cluster.id.localeCompare(right.cluster.id),
      );
    const selected = ranked[0];
    const cluster =
      selected?.cluster ??
      (await this.prisma.contentCluster.create({
        data: {
          clusterKey: clusterKey(features, policyVersion),
          policyVersion,
          title: content.originalTitle,
          primaryEntities: features.entities,
          protectedValues: features.protectedValues,
          eventStartedAt: content.publishedAt,
          metadata: { topics: features.topics, titleTokens: features.titleTokens },
        },
        include: { members: { include: { canonicalContent: true } } },
      }));
    const similarityScore = selected?.score ?? 1;
    await this.prisma.contentClusterMember.upsert({
      where: { clusterId_canonicalContentId: { clusterId: cluster.id, canonicalContentId } },
      update: { similarityScore, membershipReason: membershipReason(features, similarityScore) },
      create: {
        clusterId: cluster.id,
        canonicalContentId,
        similarityScore,
        membershipReason: membershipReason(features, similarityScore),
      },
    });
    await this.refreshPrimary(cluster.id);
    return { clusterId: cluster.id, created: !selected, similarityScore };
  }

  async rebuild(policyVersion: string) {
    await this.prisma.contentCluster.updateMany({
      where: { status: ContentClusterStatus.ACTIVE, policyVersion: { not: policyVersion } },
      data: { status: ContentClusterStatus.ARCHIVED },
    });
    const contents = await this.prisma.canonicalContent.findMany({
      where: { provenanceStatus: ContentProvenanceStatus.VERIFIED, duplicateOfId: null },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    for (const content of contents) await this.assign(content.id, policyVersion);
    return { policyVersion, processed: contents.length };
  }

  private async refreshPrimary(clusterId: string): Promise<void> {
    const cluster = await this.prisma.contentCluster.findUniqueOrThrow({
      where: { id: clusterId },
      include: { members: { include: { canonicalContent: { include: { source: true } } } } },
    });
    const primary = cluster.members
      .map((member) => ({
        member,
        score: primaryContentScore(member.canonicalContent, member.canonicalContent.source.config),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.member.canonicalContentId.localeCompare(right.member.canonicalContentId),
      )[0];
    if (!primary) return;
    await this.prisma.$transaction([
      this.prisma.contentClusterMember.updateMany({
        where: { clusterId },
        data: { isPrimary: false },
      }),
      this.prisma.contentClusterMember.update({
        where: { id: primary.member.id },
        data: { isPrimary: true },
      }),
      this.prisma.contentCluster.update({
        where: { id: clusterId },
        data: {
          primaryCanonicalContentId: primary.member.canonicalContentId,
          title: primary.member.canonicalContent.originalTitle,
        },
      }),
    ]);
  }
}

export function clusterFeatures(
  content: Pick<
    CanonicalContent,
    'originalTitle' | 'originalContent' | 'topics' | 'publishedAt'
  > & {
    claims?: Array<{ entities: string[]; numbers: Prisma.JsonValue; dates: Date[] }>;
  },
): ClusterFeatures {
  const text = `${content.originalTitle}\n${content.originalContent ?? ''}`;
  const claimEntities = content.claims?.flatMap((claim) => claim.entities) ?? [];
  const entities = [
    ...new Set([...claimEntities, ...extractEntities(content.originalTitle)]),
  ].sort();
  const claimValues =
    content.claims?.flatMap((claim) => [
      ...jsonRawValues(claim.numbers),
      ...claim.dates.map((date) => date.toISOString().slice(0, 10)),
    ]) ?? [];
  const protectedValues = [
    ...new Set([
      ...claimValues,
      ...extractFacts(text)
        .filter((fact) =>
          ['PERCENTAGE', 'CURRENCY', 'DATE_TIME', 'PRODUCT_VERSION'].includes(fact.kind),
        )
        .map((fact) => fact.normalized),
    ]),
  ].sort();
  return {
    entities,
    topics: [...content.topics].sort(),
    protectedValues,
    titleTokens: significantTokens(content.originalTitle),
    eventDay: content.publishedAt.toISOString().slice(0, 10),
  };
}

export function primaryContentScore(
  content: Pick<
    CanonicalContent,
    'sourceTier' | 'authorityScore' | 'publishedAt' | 'originalContent' | 'provenanceStatus'
  >,
  sourceConfig: Prisma.JsonValue,
  now = new Date(),
): number {
  const config = jsonRecord(sourceConfig);
  const tier = (4 - content.sourceTier) / 3;
  const authority = Number(content.authorityScore);
  const directness = config.selectionPolicy === 'ALL_ITEMS' || content.sourceTier === 1 ? 1 : 0.5;
  const freshness = Math.max(
    0,
    1 - (now.getTime() - content.publishedAt.getTime()) / (72 * 3_600_000),
  );
  const completeness = Math.min(1, (content.originalContent?.length ?? 0) / 1_500);
  const warningPenalty = content.provenanceStatus === ContentProvenanceStatus.VERIFIED ? 0 : 1;
  return (
    0.25 * tier +
    0.25 * authority +
    0.15 * directness +
    0.15 * freshness +
    0.2 * completeness -
    0.5 * warningPenalty
  );
}

function clusterSimilarity(
  features: ClusterFeatures,
  cluster: {
    primaryEntities: string[];
    protectedValues: Prisma.JsonValue;
    metadata: Prisma.JsonValue;
    eventStartedAt: Date | null;
  },
): number {
  const metadata = jsonRecord(cluster.metadata);
  const clusterValues = jsonStringArray(cluster.protectedValues);
  if (
    features.protectedValues.length > 0 &&
    clusterValues.length > 0 &&
    !setEquals(new Set(features.protectedValues), new Set(clusterValues))
  )
    return 0;
  if (
    cluster.eventStartedAt &&
    cluster.eventStartedAt.toISOString().slice(0, 10) !== features.eventDay
  )
    return 0;
  const entity = jaccard(new Set(features.entities), new Set(cluster.primaryEntities));
  const topic = jaccard(new Set(features.topics), new Set(jsonStringArray(metadata.topics)));
  const title = jaccard(
    new Set(features.titleTokens),
    new Set(jsonStringArray(metadata.titleTokens)),
  );
  return 0.45 * entity + 0.2 * topic + 0.35 * title;
}

function clusterKey(features: ClusterFeatures, policyVersion: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ policyVersion, ...features }))
    .digest('hex');
}

function membershipReason(features: ClusterFeatures, score: number): Prisma.InputJsonObject {
  return {
    score,
    entities: features.entities,
    topics: features.topics,
    protectedValues: features.protectedValues,
    eventDay: features.eventDay,
  };
}

function significantTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .normalize('NFKC')
        .toLocaleLowerCase('en-US')
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter((token) => token.length >= 3) ?? [],
    ),
  ].sort();
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function setEquals(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function jsonRawValues(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = jsonRecord(item);
        return typeof record.normalized === 'string' ? [record.normalized] : [];
      })
    : [];
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
