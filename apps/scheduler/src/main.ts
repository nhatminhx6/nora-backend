import { NestFactory } from '@nestjs/core';
import { SchedulerModule } from './scheduler.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SchedulerModule);
  app.enableShutdownHooks();
}

void bootstrap();
