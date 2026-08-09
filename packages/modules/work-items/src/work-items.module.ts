import { Module } from '@nestjs/common';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsRepository } from './work-items.repository';
import { WorkItemsService } from './work-items.service';

@Module({
  controllers: [WorkItemsController],
  providers: [WorkItemsRepository, WorkItemsService],
  exports: [WorkItemsService],
})
export class WorkItemsModule {}
