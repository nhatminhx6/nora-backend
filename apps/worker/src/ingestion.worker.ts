import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import {
  INGESTION_QUEUE,
  IngestionJobData,
  IngestionService,
  redisConnection,
} from '@nora/ingestion';

@Injectable()
export class IngestionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionWorker.name);
  private worker?: Worker<IngestionJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly ingestionService: IngestionService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<IngestionJobData>(INGESTION_QUEUE, (job) => this.process(job), {
      connection: redisConnection(this.config),
      concurrency: 4,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Ingestion job ${job?.id ?? 'unknown'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<IngestionJobData>): Promise<unknown> {
    if (job.data.type === 'sync-user') return this.ingestionService.syncUser(job.data.userId);
    await this.ingestionService.syncAllUsers();
    return { completed: true };
  }
}
