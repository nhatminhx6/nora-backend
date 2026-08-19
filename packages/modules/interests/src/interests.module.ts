import { Module } from '@nestjs/common';
import { AuthModule } from '@nora/auth';
import { InterestsController } from './interests.controller';
import { InterestsRepository } from './interests.repository';
import { InterestsService } from './interests.service';
import { PreparedContentService } from './prepared-content.service';
import { TopicSelectionController } from './topic-selection.controller';

@Module({
  imports: [AuthModule],
  controllers: [InterestsController, TopicSelectionController],
  providers: [InterestsRepository, InterestsService, PreparedContentService],
})
export class InterestsModule {}
