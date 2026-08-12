import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceRepository } from './finance.repository';
import { FinanceService } from './finance.service';
@Module({ controllers: [FinanceController], providers: [FinanceRepository, FinanceService] })
export class FinanceModule {}
