import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtUser } from '@nora/auth';
import { IngestionService } from '@nora/ingestion';
import { ContentService } from './content.service';
import { UpdateUserInsightDto } from './update-user-insight.dto';

@ApiTags('content')
@ApiBearerAuth()
@Controller()
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly ingestionService: IngestionService,
  ) {}

  @Post('ingestion/sync')
  @JwtAuthGuard()
  async syncRealData(@CurrentUser() user: JwtUser) {
    return this.ingestionService.syncUser(user.id);
  }

  @Post('dev/seed')
  @JwtAuthGuard()
  seedDevelopmentData(@CurrentUser() user: JwtUser, @Query('date') date?: string) {
    return this.contentService.seedDevelopmentData(user.id, date);
  }

  @Get('feed')
  @JwtAuthGuard()
  getHomeFeed(
    @CurrentUser() user: JwtUser,
    @Query('locale') locale?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
  ) {
    return this.contentService.getHomeFeed(user.id, locale, category, page);
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
