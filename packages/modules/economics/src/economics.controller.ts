import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@nora/auth';
import { EconomicsService } from './economics.service';
@ApiTags('economics') @ApiBearerAuth() @Controller('economics') @JwtAuthGuard()
export class EconomicsController {
  constructor(private readonly service: EconomicsService) {}
  @Get('dashboard') dashboard(@Query('locale') locale?: string) { return this.service.dashboard(locale); }
  @Get('indicators/:key') detail(@Param('key') key: string, @Query('range') range?: string, @Query('locale') locale?: string) { return this.service.detail(key, range, locale); }
}
