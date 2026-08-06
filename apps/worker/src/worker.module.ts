import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@nora/database';
import { IngestionModule } from '@nora/ingestion';
import { IngestionWorker } from './ingestion.worker';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, IngestionModule],
  providers: [IngestionWorker],
})
export class WorkerModule {}
