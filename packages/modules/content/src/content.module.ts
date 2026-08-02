import { Module } from '@nestjs/common';
import { AuthModule } from '@nora/auth';
import { IngestionModule } from '@nora/ingestion';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({ imports: [AuthModule, IngestionModule], controllers: [ContentController], providers: [ContentService] })
export class ContentModule {}
