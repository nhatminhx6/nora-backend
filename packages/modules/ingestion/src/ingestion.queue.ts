import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';
import {
  ContentJobData,
  assertContentJobData,
  contentJobOptions,
  contentJobLogMetadata,
  isContentJobData,
} from './content-job';

export const INGESTION_QUEUE = 'nora-ingestion';

export type IngestionJobData = { type: 'sync-all' } | { type: 'sync-user'; userId: string };
export type NoraIngestionJobData =
  | IngestionJobData
  | ContentJobData
  | { type: 'backfill-localizations' }
  | {
      type: 'localize-insight';
      insightId: string;
      locale: 'vi' | 'en';
      sourceContentHash: string;
      promptVersion: string;
    };

export function redisConnection(config: ConfigService) {
  const password = config.get<string>('REDIS_PASSWORD')?.trim();
  return {
    host: config.get<string>('REDIS_HOST', '127.0.0.1'),
    port: config.get<number>('REDIS_PORT', 6379),
    ...(password ? { password } : {}),
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class IngestionQueue implements OnModuleDestroy {
  private readonly queue: Queue<NoraIngestionJobData>;
  private readonly defaults: JobsOptions = {
    attempts: 4,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  };

  constructor(config: ConfigService) {
    this.queue = new Queue<NoraIngestionJobData>(INGESTION_QUEUE, {
      connection: redisConnection(config),
    });
  }

  async enqueueAll(): Promise<{ jobId: string }> {
    const bucket = Math.floor(Date.now() / 600_000);
    const job = await this.queue.add(
      'sync-sources-and-match-users',
      { type: 'sync-all' },
      { ...this.defaults, jobId: `sync-all-${bucket}` },
    );
    return { jobId: String(job.id) };
  }

  async enqueueUser(userId: string): Promise<{ jobId: string }> {
    const bucket = Math.floor(Date.now() / 60_000);
    const job = await this.queue.add(
      'sync-user',
      { type: 'sync-user', userId },
      { ...this.defaults, jobId: `sync-user-${userId}-${bucket}` },
    );
    return { jobId: String(job.id) };
  }

  async enqueueLocalization(input: {
    insightId: string;
    locale: 'vi' | 'en';
    sourceContentHash: string;
    promptVersion: string;
  }): Promise<{ jobId: string }> {
    const job = await this.queue.add(
      'localize-insight',
      { type: 'localize-insight', ...input },
      {
        ...this.defaults,
        attempts: 6,
        backoff: { type: 'exponential', delay: 30_000 },
        jobId: `localize-${input.insightId}-${input.locale}-${input.sourceContentHash}-${input.promptVersion}`,
      },
    );
    return { jobId: String(job.id) };
  }

  async enqueueLocalizationBackfill(): Promise<{ jobId: string }> {
    const bucket = Math.floor(Date.now() / 3_600_000);
    const job = await this.queue.add(
      'backfill-localizations',
      { type: 'backfill-localizations' },
      { ...this.defaults, jobId: `backfill-localizations-${bucket}` },
    );
    return { jobId: String(job.id) };
  }

  async enqueueContentJob(data: ContentJobData): Promise<{ jobId: string }> {
    assertContentJobData(data);
    const job = await this.queue.add(
      data.type.toLocaleLowerCase('en-US'),
      data,
      contentJobOptions(data),
    );
    return { jobId: String(job.id) };
  }

  async listFailedContentJobs(start = 0, end = 99) {
    const jobs = await this.queue.getFailed(start, end);
    return jobs
      .filter((job) => isContentJobData(job.data))
      .map((job) => ({
        jobId: String(job.id),
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        metadata: contentJobLogMetadata(job.data as ContentJobData, job.attemptsMade),
      }));
  }

  async failedContentJobs(start = 0, end = 99) {
    const jobs = await this.queue.getFailed(start, end);
    return jobs
      .filter((job) => isContentJobData(job.data))
      .map((job) => ({
        jobId: String(job.id),
        failedReason: job.failedReason,
        errorCode: job.failedReason.split(':')[0] ?? 'UNKNOWN',
        attemptsMade: job.attemptsMade,
        data: job.data as ContentJobData,
      }));
  }

  async retryFailedJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job || !isContentJobData(job.data) || (await job.getState()) !== 'failed')
      throw new Error('FAILED_JOB_NOT_FOUND');
    await job.retry('failed');
  }

  async metrics() {
    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    const oldest = (await this.queue.getWaiting(0, 0))[0];
    return {
      ...counts,
      oldestWaitingAgeMs: oldest?.timestamp ? Math.max(0, Date.now() - oldest.timestamp) : 0,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
