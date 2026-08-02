import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtUser } from '@nora/auth';
import { ContentService } from './content.service';
import { UpdateUserInsightDto } from './update-user-insight.dto';

@ApiTags('content')
@ApiBearerAuth()
@Controller()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post('dev/seed')
  @JwtAuthGuard()
  seedDevelopmentData(@CurrentUser() user: JwtUser, @Query('date') date?: string) {
    return this.contentService.seedDevelopmentData(user.id, date);
  }

  @Get('briefs/daily')
  @JwtAuthGuard()
  getDailyBrief(@CurrentUser() user: JwtUser, @Query('date') date?: string) {
    return this.contentService.getDailyBrief(user.id, date);
  }

  @Get('interests/:id/insights')
  @JwtAuthGuard()
  getInterestInsights(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contentService.getInterestInsights(user.id, id);
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
