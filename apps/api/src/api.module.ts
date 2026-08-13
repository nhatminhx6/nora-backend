import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import {
  ApiResponseInterceptor,
  GlobalExceptionFilter,
  RequestContextInterceptor,
} from '@nora/common';
import { DatabaseModule } from '@nora/database';
import { AuthModule } from '@nora/auth';
import { InterestsModule } from '@nora/interests';
import { UsersModule } from '@nora/users';
import { ContentModule } from '@nora/content';
import { WorkItemsModule } from '@nora/work-items';
import { FinanceModule } from '@nora/finance';
import { EconomicsModule } from '@nora/economics';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    InterestsModule,
    ContentModule,
    WorkItemsModule,
    FinanceModule,
    EconomicsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class ApiModule {}
