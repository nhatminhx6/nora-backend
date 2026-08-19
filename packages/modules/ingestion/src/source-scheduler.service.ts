import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';
import { IngestionQueue } from './ingestion.queue';
import { SourceHealthService } from './source-health.service';

interface DueSubscriptionRow {
  id: string;
  sourceId: string;
  intervalSec: number;
}

@Injectable()
export class SourceSchedulerService {
  private readonly logger = new Logger(SourceSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: IngestionQueue,
    private readonly health?: SourceHealthService,
  ) {}

  async scheduleDueSources(now = new Date(), limit = 100, owner?: string) {
    await this.health?.releaseDueProbes(now);
    const leaseOwner = owner ?? `${hostname()}-${process.pid}-${randomUUID()}`;
    const pipelineRun = await this.prisma.pipelineRun.create({
      data: { pipeline: 'content-v2-discovery', status: 'RUNNING', metadata: { leaseOwner } },
      select: { id: true },
    });
    const correlationId = randomUUID();
    this.logger.log(
      JSON.stringify({
        event: 'content_root_start',
        pipelineRunId: pipelineRun.id,
        correlationId,
        leaseOwner,
      }),
    );
    const claimed = await this.claim(now, limit, leaseOwner);
    const jobIds: string[] = [];
    try {
      for (const item of claimed) {
        const result = await this.queue.enqueueContentJob({
          version: 2,
          type: 'FETCH_SOURCE',
          correlationId,
          pipelineRunId: pipelineRun.id,
          sourceId: item.sourceId,
          subscriptionId: item.id,
          scheduleBucket: scheduleBucket(now),
          attempt: 0,
        });
        jobIds.push(result.jobId);
      }
      await this.prisma.pipelineRun.update({
        where: { id: pipelineRun.id },
        data: {
          status: 'SUCCEEDED',
          processedCount: jobIds.length,
          completedAt: new Date(),
          metadata: { leaseOwner, correlationId, claimed: claimed.length },
        },
      });
      this.logger.log(
        JSON.stringify({
          event: 'content_root_success',
          pipelineRunId: pipelineRun.id,
          correlationId,
          claimed: claimed.length,
          enqueued: jobIds.length,
        }),
      );
      return {
        pipelineRunId: pipelineRun.id,
        claimed: claimed.length,
        enqueued: jobIds.length,
        jobIds,
      };
    } catch (error) {
      const pending = claimed.slice(jobIds.length);
      await this.prisma.sourceSubscription.updateMany({
        where: { id: { in: pending.map((item) => item.id) }, leaseOwner },
        data: { leaseOwner: null, leaseExpiresAt: null, nextSyncAt: now },
      });
      await this.prisma.pipelineRun.update({
        where: { id: pipelineRun.id },
        data: {
          status: 'FAILED',
          errorCode: 'FETCH_SOURCE_ENQUEUE_FAILED',
          processedCount: jobIds.length,
          rejectedCount: pending.length,
          completedAt: new Date(),
        },
      });
      this.logger.error(
        JSON.stringify({
          event: 'content_root_failure',
          pipelineRunId: pipelineRun.id,
          correlationId,
          errorCode: 'FETCH_SOURCE_ENQUEUE_FAILED',
          enqueued: jobIds.length,
          rejected: pending.length,
        }),
      );
      throw error;
    }
  }

  private claim(now: Date, limit: number, leaseOwner: string): Promise<DueSubscriptionRow[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const leaseExpiresAt = new Date(now.getTime() + 120_000);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DueSubscriptionRow[]>(Prisma.sql`
        SELECT ss."id", ss."source_id" AS "sourceId", s."default_interval_sec" AS "intervalSec"
        FROM "source_subscriptions" ss
        JOIN "sources" s ON s."id" = ss."source_id"
        WHERE ss."status" = 'ACTIVE'::"SubscriptionStatus"
          AND ss."next_sync_at" <= ${now}
          AND (ss."lease_expires_at" IS NULL OR ss."lease_expires_at" <= ${now})
          AND s."status" = 'ACTIVE'::"SourceStatus"
        ORDER BY ss."next_sync_at", ss."id"
        LIMIT ${safeLimit}
        FOR UPDATE OF ss SKIP LOCKED
      `);
      for (const row of rows) {
        await tx.sourceSubscription.update({
          where: { id: row.id },
          data: {
            leaseOwner,
            leaseExpiresAt,
            lastClaimedAt: now,
            nextSyncAt: nextSourceSyncAt(now, row.intervalSec, row.id),
          },
        });
      }
      return rows;
    });
  }
}

export function scheduleBucket(now: Date, bucketMs = 600_000): string {
  return new Date(Math.floor(now.getTime() / bucketMs) * bucketMs).toISOString();
}

export function nextSourceSyncAt(now: Date, intervalSec: number, identity: string): Date {
  const interval = Math.max(60, intervalSec);
  const ratio = createHash('sha256').update(identity).digest().readUInt16BE(0) / 65_535;
  return new Date(now.getTime() + interval * 1_000 + Math.floor(interval * 50 * ratio));
}

export function isPipelineFlagEnabled(raw: string | undefined, fallback: boolean): boolean {
  return raw === undefined ? fallback : raw.trim().toLocaleLowerCase('en-US') === 'true';
}
