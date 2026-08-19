import { Injectable } from '@nestjs/common';
import { SourceCircuitState } from '@prisma/client';
import { PrismaService } from '@nora/database';
import { IngestionQueue } from './ingestion.queue';

export interface DlqFilter {
  type?: string;
  sourceId?: string;
  errorCode?: string;
  limit: number;
}

@Injectable()
export class DeadLetterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: IngestionQueue,
  ) {}
  async inspect(filter: DlqFilter) {
    const jobs = await this.queue.failedContentJobs(0, Math.max(filter.limit * 5, 99));
    return jobs
      .filter(
        (job) =>
          (!filter.type || job.data.type === filter.type) &&
          (!filter.sourceId || job.data.sourceId === filter.sourceId) &&
          (!filter.errorCode || job.errorCode === filter.errorCode),
      )
      .slice(0, filter.limit);
  }
  async retry(filter: DlqFilter, options: { max: number; policyChanged: boolean }) {
    const jobs = await this.inspect({ ...filter, limit: Math.min(filter.limit, options.max) });
    let retried = 0;
    const skipped: Array<{ jobId: string; reason: string }> = [];
    for (const job of jobs) {
      if (
        /^(VALIDATION_REJECTED|PROVENANCE_REJECTED|LOCALIZATION_QUALITY_REJECTED|LOCALIZATION_SCHEMA_INVALID)$/u.test(
          job.errorCode,
        ) &&
        !options.policyChanged
      ) {
        skipped.push({ jobId: job.jobId, reason: 'POLICY_CHANGE_REQUIRED' });
        continue;
      }
      if (job.data.sourceId && (await this.sourceCircuitOpen(job.data.sourceId))) {
        skipped.push({ jobId: job.jobId, reason: 'SOURCE_CIRCUIT_OPEN' });
        continue;
      }
      await this.queue.retryFailedJob(job.jobId);
      retried += 1;
    }
    return { inspected: jobs.length, retried, skipped };
  }
  private async sourceCircuitOpen(sourceId: string): Promise<boolean> {
    return (
      (await this.prisma.sourceSubscription.count({
        where: {
          sourceId,
          circuitState: { in: [SourceCircuitState.OPEN, SourceCircuitState.MANUAL_PAUSED] },
        },
      })) > 0
    );
  }
}

export function parseDlqArgs(args: string[]) {
  const action = args[0];
  if (action !== 'inspect' && action !== 'retry') throw new Error('DLQ_ACTION_INVALID');
  const values = Object.fromEntries(
    args
      .slice(1)
      .filter((arg) => arg.startsWith('--') && arg.includes('='))
      .map((arg) => {
        const at = arg.indexOf('=');
        return [arg.slice(2, at), arg.slice(at + 1)];
      }),
  );
  const limit = values.limit ? Number(values.limit) : 50;
  const max = values.max ? Number(values.max) : 20;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 500 ||
    !Number.isInteger(max) ||
    max < 1 ||
    max > 100
  )
    throw new Error('DLQ_LIMIT_INVALID');
  return {
    action,
    filter: {
      limit,
      ...(values.type ? { type: values.type } : {}),
      ...(values.source ? { sourceId: values.source } : {}),
      ...(values.error ? { errorCode: values.error } : {}),
    },
    max,
    policyChanged: args.includes('--policy-changed'),
  };
}
