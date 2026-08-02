import { Module } from '@nestjs/common';
import { AuthModule } from '@nora/auth';
import { InterestsController } from './interests.controller';
import { InterestsRepository } from './interests.repository';
import { InterestsService } from './interests.service';

@Module({
  imports: [AuthModule],
  controllers: [InterestsController],
  providers: [InterestsRepository, InterestsService],
})
export class InterestsModule {}
