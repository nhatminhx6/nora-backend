import { Module } from '@nestjs/common';
import { AuthModule } from '@nora/auth';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({ imports: [AuthModule], controllers: [ContentController], providers: [ContentService] })
export class ContentModule {}
