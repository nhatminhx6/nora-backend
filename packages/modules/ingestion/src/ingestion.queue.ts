import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';

export const INGESTION_QUEUE = 'nora-ingestion';

export type IngestionJobData = { type: 'sync-all' } | { type: 'sync-user'; userId: string };

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
  private readonly queue: Queue<IngestionJobData>;
  private readonly defaults: JobsOptions = {
    attempts: 4,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  };

  constructor(config: ConfigService) {
    this.queue = new Queue<IngestionJobData>(INGESTION_QUEUE, {
      connection: redisConnection(config),
    });
  }

  async enqueueAll(): Promise<{ jobId: string }> {
    const bucket = Math.floor(Date.now() / 600_000);
    const job = await this.queue.add(
      'sync-all',
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

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
