import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';
import { IngestionQueue } from './ingestion.queue';

export interface ReplayOptions {
  dryRun: boolean;
  actor: string;
  payloadId?: string;
  sourceId?: string;
  from?: Date;
  to?: Date;
  processingVersion: string;
  limit: number;
}

@Injectable()
export class RawPayloadReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: IngestionQueue,
  ) {}
  async replay(options: ReplayOptions) {
    const payloads = await this.prisma.rawSourcePayload.findMany({
      where: {
        ...(options.payloadId ? { id: options.payloadId } : {}),
        ...(options.sourceId ? { sourceId: options.sourceId } : {}),
        ...(options.from || options.to
          ? {
              fetchedAt: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        AND: [{ OR: [{ payload: { not: null } }, { payloadRef: { not: null } }] }],
      },
      orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }],
      take: options.limit,
    });
    const run = await this.prisma.pipelineRun.create({
      data: {
        pipeline: 'RAW_PAYLOAD_REPLAY',
        status: options.dryRun ? 'DRY_RUN' : 'RUNNING',
        processedCount: 0,
        metadata: {
          actor: options.actor,
          command: 'content:replay',
          processingVersion: options.processingVersion,
          filters: replayFilters(options),
          payloadIds: payloads.map((payload) => payload.id),
        },
      },
    });
    let queued = 0;
    if (!options.dryRun)
      for (const payload of payloads) {
        await this.queue.enqueueContentJob({
          version: 2,
          type: 'NORMALIZE_PAYLOAD',
          correlationId: randomUUID(),
          pipelineRunId: run.id,
          sourceId: payload.sourceId,
          rawPayloadId: payload.id,
          attempt: 0,
        });
        queued += 1;
      }
    await this.prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: options.dryRun ? 'DRY_RUN_COMPLETE' : 'QUEUED',
        processedCount: queued,
        completedAt: new Date(),
      },
    });
    return { pipelineRunId: run.id, matched: payloads.length, queued, dryRun: options.dryRun };
  }
}

export function parseReplayArgs(args: string[]): ReplayOptions {
  const values = Object.fromEntries(
    args
      .filter((arg) => arg.startsWith('--') && arg.includes('='))
      .map((arg) => {
        const index = arg.indexOf('=');
        return [arg.slice(2, index), arg.slice(index + 1)];
      }),
  );
  if (!values.actor?.trim()) throw new Error('REPLAY_ACTOR_REQUIRED');
  if (!values.version?.trim()) throw new Error('REPLAY_VERSION_REQUIRED');
  const limit = values.limit ? Number(values.limit) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('REPLAY_LIMIT_INVALID');
  return {
    dryRun: args.includes('--dry-run'),
    actor: values.actor,
    processingVersion: values.version,
    limit,
    ...(values.payload ? { payloadId: values.payload } : {}),
    ...(values.source ? { sourceId: values.source } : {}),
    ...(values.from ? { from: parseDate(values.from) } : {}),
    ...(values.to ? { to: parseDate(values.to) } : {}),
  };
}
function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('REPLAY_DATE_INVALID');
  return date;
}
function replayFilters(options: ReplayOptions): Prisma.InputJsonObject {
  return {
    payloadId: options.payloadId ?? null,
    sourceId: options.sourceId ?? null,
    from: options.from?.toISOString() ?? null,
    to: options.to?.toISOString() ?? null,
    limit: options.limit,
  };
}
