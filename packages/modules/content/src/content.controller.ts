import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtUser } from '@nora/auth';
import { IngestionQueue } from '@nora/ingestion';
import { ContentService } from './content.service';
import { UpdateUserInsightDto } from './update-user-insight.dto';

@ApiTags('content')
@ApiBearerAuth()
@Controller()
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly ingestionQueue: IngestionQueue,
  ) {}

  @Post('ingestion/sync')
  @JwtAuthGuard()
  async syncRealData(@CurrentUser() user: JwtUser) {
    return this.ingestionQueue.enqueueUser(user.id);
  }

  @Post('dev/seed')
  @JwtAuthGuard()
  seedDevelopmentData(@CurrentUser() user: JwtUser, @Query('date') date?: string) {
    return this.contentService.seedDevelopmentData(user.id, date);
  }

  @Get('briefs/daily')
  @JwtAuthGuard()
  getDailyBrief(
    @CurrentUser() user: JwtUser,
    @Query('locale') locale?: string,
    @Query('date') date?: string,
  ) {
    return this.contentService.getDailyBrief(user.id, locale, date);
  }

  @Get('interests/:id/insights')
  @JwtAuthGuard()
  getInterestInsights(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') locale?: string,
  ) {
    return this.contentService.getInterestInsights(user.id, id, locale);
  }

  @Patch('user-insights/:id')
  @JwtAuthGuard()
  updateUserInsight(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserInsightDto,
  ) {
    return this.contentService.updateUserInsight(user.id, id, dto);
  }
}
