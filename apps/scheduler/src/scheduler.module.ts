import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@nora/database';
import { IngestionModule } from '@nora/ingestion';
import { IngestionJob } from './ingestion.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    IngestionModule,
  ],
  providers: [IngestionJob],
})
export class SchedulerModule {}
