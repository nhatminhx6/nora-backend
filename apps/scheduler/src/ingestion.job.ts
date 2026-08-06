import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IngestionQueue } from '@nora/ingestion';

@Injectable()
export class IngestionJob {
  private readonly logger = new Logger(IngestionJob.name);

  constructor(private readonly ingestionQueue: IngestionQueue) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'rss-ingestion' })
  async run(): Promise<void> {
    const { jobId } = await this.ingestionQueue.enqueueAll();
    this.logger.log(`Queued RSS ingestion job ${jobId}`);
  }
}
