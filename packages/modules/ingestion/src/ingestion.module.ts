import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nora/database';
import { IngestionService } from './ingestion.service';
import { IngestionQueue } from './ingestion.queue';
import { RssSourceAdapter } from './rss-source.adapter';

@Module({
  imports: [DatabaseModule],
  providers: [IngestionService, IngestionQueue, RssSourceAdapter],
  exports: [IngestionService, IngestionQueue],
})
export class IngestionModule {}
