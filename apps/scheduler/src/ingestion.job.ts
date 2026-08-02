import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IngestionService } from '@nora/ingestion';

@Injectable()
export class IngestionJob {
  private readonly logger = new Logger(IngestionJob.name);

  constructor(private readonly ingestionService: IngestionService) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'rss-ingestion' })
  async run(): Promise<void> {
    this.logger.log('Starting RSS ingestion');
    await this.ingestionService.syncAllUsers();
    this.logger.log('RSS ingestion completed');
  }
}
