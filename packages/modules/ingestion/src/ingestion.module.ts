import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nora/database';
import { IngestionService } from './ingestion.service';
import { IngestionQueue } from './ingestion.queue';
import { RssSourceAdapter } from './rss-source.adapter';
import { ArticleContentExtractor } from './article-content.extractor';
import { MyMemoryTranslationProvider } from './mymemory-translation.provider';
import { TRANSLATION_PROVIDER } from './translation-provider';
import { OpenAiTranslationProvider } from './openai-translation.provider';
import { LocalizationQualityValidator } from './localization-quality.validator';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [DatabaseModule],
  providers: [
    IngestionService,
    IngestionQueue,
    RssSourceAdapter,
    ArticleContentExtractor,
    MyMemoryTranslationProvider,
    OpenAiTranslationProvider,
    LocalizationQualityValidator,
    {
      provide: TRANSLATION_PROVIDER,
      inject: [ConfigService, MyMemoryTranslationProvider, OpenAiTranslationProvider],
      useFactory: (
        config: ConfigService,
        myMemory: MyMemoryTranslationProvider,
        openAi: OpenAiTranslationProvider,
      ) => {
        const provider = config.get<string>('TRANSLATION_PROVIDER', 'mymemory');
        if (config.get<string>('NODE_ENV') === 'production' && provider !== 'openai') {
          throw new Error('Production requires TRANSLATION_PROVIDER=openai');
        }
        return provider === 'openai' ? openAi : myMemory;
      },
    },
  ],
  exports: [IngestionService, IngestionQueue],
})
export class IngestionModule {}
