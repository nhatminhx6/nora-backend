import { Injectable } from '@nestjs/common';
import { ContentAudienceMatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';
import { MATCHING_POLICY_V1 } from './candidate-matching.service';
import { rankingScore } from './content-ranking.service';

export const CONTENT_FEED_V2_FLAG = 'contentFeedVersion';

@Injectable()
export class ContentRolloutService {
  constructor(private readonly prisma: PrismaService) {}

  async setAccount(input: { email: string; enabled: boolean; actor: string; reason: string }) {
    if (!input.actor.trim() || !input.reason.trim()) throw new Error('ROLLOUT_AUDIT_REQUIRED');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { email: input.email } });
    const profile = jsonRecord(user.profileData);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        locale: 'vi',
        homeMarket: 'VN',
        followedMarkets: ['GLOBAL', 'US'],
        profileData: {
          ...profile,
          [CONTENT_FEED_V2_FLAG]: input.enabled ? 'v2' : 'v1',
        } as Prisma.InputJsonObject,
      },
    });
    let matched = 0;
    if (input.enabled) matched = await this.createEligibleMatches(user.id);
    await this.prisma.pipelineRun.create({
      data: {
        pipeline: 'CONTENT_ROLLOUT',
        status: 'COMPLETED',
        locale: 'vi',
        processedCount: matched,
        completedAt: new Date(),
        metadata: {
          actor: input.actor,
          reason: input.reason,
          userId: user.id,
          email: input.email,
          enabled: input.enabled,
          version: 'content-rollout-v1',
        },
      },
    });
    return { userId: user.id, email: input.email, enabled: input.enabled, matched };
  }

  private async createEligibleMatches(userId: string): Promise<number> {
    const [user, contents] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.canonicalContent.findMany({
        where: {
          provenanceStatus: 'VERIFIED',
          duplicateOfId: null,
          localizations: { some: { locale: 'vi', status: 'VERIFIED' } },
        },
      }),
    ]);
    for (const content of contents) {
      const relevanceScore = Number(content.authorityScore);
      const ranking = rankingScore({
        relevanceScore,
        entityMatches: 0,
        authority: Number(content.authorityScore),
        importance: numberValue(jsonRecord(content.metadata).importanceScore, relevanceScore),
        publishedAt: content.publishedAt,
        now: new Date(),
        markets: content.markets,
        homeMarket: 'VN',
        followedMarkets: ['GLOBAL', 'US'],
        duplicate: false,
        alreadySeen: false,
      });
      await this.prisma.contentAudienceMatch.upsert({
        where: {
          userId_canonicalContentId_locale_policyVersion: {
            userId,
            canonicalContentId: content.id,
            locale: 'vi',
            policyVersion: MATCHING_POLICY_V1,
          },
        },
        update: {
          relevanceScore,
          rankingScore: ranking.score,
          matchedReason: { version: MATCHING_POLICY_V1, rollout: true },
          status: ContentAudienceMatchStatus.ACTIVE,
          metadata: { ranking } as unknown as Prisma.InputJsonObject,
        },
        create: {
          userId,
          canonicalContentId: content.id,
          locale: 'vi',
          policyVersion: MATCHING_POLICY_V1,
          relevanceScore,
          rankingScore: ranking.score,
          matchedReason: { version: MATCHING_POLICY_V1, rollout: true },
          metadata: { ranking } as unknown as Prisma.InputJsonObject,
        },
      });
    }
    return contents.length;
  }
}

export function accountFeedV2Enabled(profileData: Prisma.JsonValue): boolean {
  return jsonRecord(profileData)[CONTENT_FEED_V2_FLAG] === 'v2';
}
export function globalFeedV2Enabled(
  value = process.env.CONTENT_FEED_V2_ENABLED,
  environment = process.env.NODE_ENV,
): boolean {
  if (value !== undefined) return value === 'true';
  return environment !== 'production';
}
function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
