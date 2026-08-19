import { Module } from '@nestjs/common';
import { AuthModule } from '@nora/auth';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { FeedV2Service } from './feed-v2.service';

@Module({
  imports: [AuthModule],
  controllers: [ContentController],
  providers: [ContentService, FeedV2Service],
})
export class ContentModule {}
