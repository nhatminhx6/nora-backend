import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtUser } from '@nora/auth';
import { CreateFinanceTransactionDto, SetFinanceBudgetDto, UpdateFinanceTransactionDto } from './finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('finance') @ApiBearerAuth() @Controller('finance') @JwtAuthGuard()
export class FinanceController {
  constructor(private readonly service: FinanceService) {}
  @Get('categories') categories(@CurrentUser() user: JwtUser) { return this.service.categories(user.id); }
  @Get('summary') summary(@CurrentUser() user: JwtUser, @Query('month') month?: string) { return this.service.summary(user.id, month); }
  @Get('transactions') list(@CurrentUser() user: JwtUser, @Query('month') month?: string, @Query('page') page?: string) { return this.service.list(user.id, month, page); }
  @Post('transactions') create(@CurrentUser() user: JwtUser, @Body() dto: CreateFinanceTransactionDto) { return this.service.create(user.id, dto); }
  @Patch('transactions/:id') update(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFinanceTransactionDto) { return this.service.update(user.id, id, dto); }
  @Delete('transactions/:id') delete(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.delete(user.id, id); }
  @Put('budget') budget(@CurrentUser() user: JwtUser, @Query('month') month: string | undefined, @Body() dto: SetFinanceBudgetDto) { return this.service.setBudget(user.id, month, dto); }
}
