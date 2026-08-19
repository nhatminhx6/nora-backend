import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CanonicalContentStatus,
  ContentLocalizationStatus,
  ContentProvenanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@nora/database';
import { CandidateMatchingService } from './candidate-matching.service';
import { ContentClusteringService } from './content-clustering.service';
import { ContentMetricsService } from './content-metrics.service';
import { IngestionQueue } from './ingestion.queue';
import { SourceHealthService } from './source-health.service';

export type ContentOperation =
  | { action: 'pause-source' | 'resume-source' | 'source-health'; subscriptionId: string }
  | {
      action: 'relocalize';
      canonicalContentId: string;
      locale: 'vi' | 'en';
      policyVersion: string;
      glossaryVersion: string;
    }
  | { action: 'rebuild-clusters'; policyVersion: string }
  | { action: 'retract' | 'reject'; canonicalContentId: string }
  | { action: 'backfill-matches'; limit: number }
  | { action: 'metrics' }
  | { action: 'toggle-pipeline'; mode: 'v1' | 'v2' | 'shadow' };

@Injectable()
export class ContentOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: SourceHealthService,
    private readonly queue: IngestionQueue,
    private readonly clustering: ContentClusteringService,
    private readonly matching: CandidateMatchingService,
    private readonly metrics: ContentMetricsService,
    private readonly config: ConfigService,
  ) {}
  async execute(operation: ContentOperation, context: { actor: string; reason: string }) {
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      this.config.get<string>('CONTENT_ADMIN_OPS_ENABLED') !== 'true'
    )
      throw new Error('CONTENT_ADMIN_OPS_DISABLED');
    if (!context.actor.trim() || !context.reason.trim())
      throw new Error('OPS_ACTOR_REASON_REQUIRED');
    const audit = await this.prisma.pipelineRun.create({
      data: {
        pipeline: 'CONTENT_ADMIN_OPERATION',
        status: 'RUNNING',
        metadata: {
          actor: context.actor,
          reason: context.reason,
          operation: operation as unknown as Prisma.InputJsonValue,
          timestamp: new Date().toISOString(),
        },
      },
    });
    try {
      const result = await this.perform(operation, audit.id);
      await this.prisma.pipelineRun.update({
        where: { id: audit.id },
        data: { status: 'SUCCEEDED', processedCount: 1, completedAt: new Date() },
      });
      return { auditId: audit.id, result };
    } catch (error) {
      await this.prisma.pipelineRun.update({
        where: { id: audit.id },
        data: {
          status: 'FAILED',
          errorCode: error instanceof Error ? error.message.slice(0, 80) : 'OPS_FAILED',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }
  private async perform(operation: ContentOperation, pipelineRunId: string): Promise<unknown> {
    switch (operation.action) {
      case 'pause-source':
        await this.health.manualPause(operation.subscriptionId);
        return { paused: true };
      case 'resume-source':
        await this.health.manualResume(operation.subscriptionId);
        return { resumed: true };
      case 'source-health':
        return this.prisma.sourceSubscription.findUniqueOrThrow({
          where: { id: operation.subscriptionId },
          select: {
            id: true,
            status: true,
            circuitState: true,
            lastSuccessAt: true,
            consecutiveFailures: true,
            lastErrorCode: true,
            healthMetrics: true,
          },
        });
      case 'relocalize': {
        const content = await this.prisma.canonicalContent.findUniqueOrThrow({
          where: { id: operation.canonicalContentId },
        });
        await this.prisma.contentLocalization.updateMany({
          where: { canonicalContentId: content.id, locale: operation.locale },
          data: { status: ContentLocalizationStatus.PENDING, verifiedAt: null },
        });
        return this.queue.enqueueContentJob({
          version: 2,
          type: 'LOCALIZE_CONTENT',
          correlationId: randomUUID(),
          pipelineRunId,
          canonicalContentId: content.id,
          locale: operation.locale,
          sourceContentHash: content.contentHash,
          policyVersion: operation.policyVersion,
          glossaryVersion: operation.glossaryVersion,
          attempt: 0,
        });
      }
      case 'rebuild-clusters':
        return this.clustering.rebuild(operation.policyVersion);
      case 'retract':
        return this.prisma.canonicalContent.update({
          where: { id: operation.canonicalContentId },
          data: { status: CanonicalContentStatus.RETRACTED },
          select: { id: true, status: true },
        });
      case 'reject':
        return this.prisma.canonicalContent.update({
          where: { id: operation.canonicalContentId },
          data: {
            status: CanonicalContentStatus.REJECTED,
            provenanceStatus: ContentProvenanceStatus.REJECTED,
          },
          select: { id: true, status: true },
        });
      case 'backfill-matches': {
        const contents = await this.prisma.canonicalContent.findMany({
          where: { provenanceStatus: ContentProvenanceStatus.VERIFIED, duplicateOfId: null },
          orderBy: { id: 'asc' },
          take: Math.min(1000, operation.limit),
          select: { id: true },
        });
        for (const content of contents) await this.matching.matchCanonicalContent(content.id);
        return { processed: contents.length };
      }
      case 'metrics':
        return this.metrics.snapshot();
      case 'toggle-pipeline':
        return pipelineEnv(operation.mode);
    }
  }
}

export function pipelineEnv(mode: 'v1' | 'v2' | 'shadow') {
  if (mode === 'v2')
    return {
      CONTENT_PIPELINE_V1_ENABLED: 'false',
      CONTENT_PIPELINE_V2_ENABLED: 'true',
      CONTENT_PIPELINE_V2_SHADOW: 'false',
      restartRequired: true,
    };
  if (mode === 'shadow')
    return {
      CONTENT_PIPELINE_V1_ENABLED: 'true',
      CONTENT_PIPELINE_V2_ENABLED: 'false',
      CONTENT_PIPELINE_V2_SHADOW: 'true',
      restartRequired: true,
    };
  return {
    CONTENT_PIPELINE_V1_ENABLED: 'true',
    CONTENT_PIPELINE_V2_ENABLED: 'false',
    CONTENT_PIPELINE_V2_SHADOW: 'false',
    restartRequired: true,
  };
}
