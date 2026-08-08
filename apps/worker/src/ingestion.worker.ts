import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import {
  INGESTION_QUEUE,
  IngestionQueue,
  IngestionService,
  NoraIngestionJobData,
  redisConnection,
} from '@nora/ingestion';

@Injectable()
export class IngestionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionWorker.name);
  private worker?: Worker<NoraIngestionJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly ingestionService: IngestionService,
    private readonly ingestionQueue: IngestionQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<NoraIngestionJobData>(INGESTION_QUEUE, (job) => this.process(job), {
      connection: redisConnection(this.config),
      concurrency: 4,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Ingestion job ${job?.id ?? 'unknown'} failed: ${error.message}`);
    });
    const { jobId } = await this.ingestionQueue.enqueueLocalizationBackfill();
    this.logger.log(`Queued localization backfill job ${jobId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<NoraIngestionJobData>): Promise<unknown> {
    try {
      if (job.data.type === 'localize-insight') {
        return await this.ingestionService.localizeInsightById(job.data);
      }
      if (job.data.type === 'sync-user') {
        return await this.ingestionService.syncUser(job.data.userId);
      }
      if (job.data.type === 'backfill-localizations') {
        return await this.ingestionService.enqueuePendingLocalizations();
      }
      await this.ingestionService.syncAllUsers();
      return { completed: true };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('UNKNOWN_JOB_ERROR');
      await this.ingestionService.recordJobFailure(job.data.type, failure, {
        jobId: String(job.id),
        attempt: job.attemptsMade + 1,
      });
      throw failure;
    }
  }
}
