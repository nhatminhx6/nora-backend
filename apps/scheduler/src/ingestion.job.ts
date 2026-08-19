import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { IngestionQueue, SourceSchedulerService, isPipelineFlagEnabled } from '@nora/ingestion';

@Injectable()
export class IngestionJob {
  private readonly logger = new Logger(IngestionJob.name);

  constructor(
    private readonly ingestionQueue: IngestionQueue,
    private readonly sourceScheduler: SourceSchedulerService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'rss-ingestion' })
  async run(): Promise<void> {
    const v2Enabled = isPipelineFlagEnabled(this.config.get('CONTENT_PIPELINE_V2_ENABLED'), false);
    // Shadow discovery is opt-in at runtime until the v2 FETCH_SOURCE worker is deployed.
    const v2Shadow = isPipelineFlagEnabled(this.config.get('CONTENT_PIPELINE_V2_SHADOW'), false);
    const v1Enabled = isPipelineFlagEnabled(this.config.get('CONTENT_PIPELINE_V1_ENABLED'), true);

    if (v2Enabled || v2Shadow) {
      const result = await this.sourceScheduler.scheduleDueSources();
      this.logger.log(
        `Content v2 discovery claimed=${result.claimed} enqueued=${result.enqueued} shadow=${!v2Enabled}`,
      );
    }
    if (v1Enabled) {
      const { jobId } = await this.ingestionQueue.enqueueAll();
      this.logger.log(`Queued legacy RSS ingestion job ${jobId}`);
    }
  }
}
