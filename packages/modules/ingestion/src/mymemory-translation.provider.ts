import { Injectable, Logger } from '@nestjs/common';
import { TranslationLocale, TranslationProvider, TranslationResult } from './translation-provider';

@Injectable()
export class MyMemoryTranslationProvider implements TranslationProvider {
  private readonly logger = new Logger(MyMemoryTranslationProvider.name);
  private nextRequestAt = 0;
  private blockedUntil = 0;

  async translate(
    value: string,
    source: TranslationLocale,
    target: TranslationLocale,
  ): Promise<TranslationResult> {
    if (source === target)
      return { text: value, provider: 'source-original', model: 'source-original' };
    if (Date.now() < this.blockedUntil) {
      return { text: value, provider: 'fallback-original', model: 'none' };
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.waitForSlot();
        const parameters = new URLSearchParams({ q: value, langpair: `${source}|${target}` });
        const response = await fetch(
          `https://api.mymemory.translated.net/get?${parameters.toString()}`,
          {
            headers: { 'User-Agent': 'NoraBot/0.3 (+local-development)' },
            signal: AbortSignal.timeout(8_000),
          },
        );
        if (response.status === 429) {
          if (attempt === 0) {
            await this.sleep(1_500);
            continue;
          }
          this.blockedUntil = Date.now() + 60_000;
          this.logger.warn('Translation circuit opened for 60 seconds after repeated HTTP 429');
          return { text: value, provider: 'fallback-original', model: 'none' };
        }
        if (!response.ok) throw new Error(`translation returned HTTP ${response.status}`);
        const payload = (await response.json()) as { responseData?: { translatedText?: string } };
        const translated = payload.responseData?.translatedText?.trim();
        return translated
          ? { text: translated, provider: 'mymemory', model: 'mymemory-api' }
          : { text: value, provider: 'fallback-original', model: 'none' };
      } catch (error) {
        if (attempt === 2) {
          this.logger.warn(
            `Translation to ${target} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }
    }
    return { text: value, provider: 'fallback-original', model: 'none' };
  }

  private async waitForSlot(): Promise<void> {
    const waitMs = Math.max(0, this.nextRequestAt - Date.now());
    if (waitMs > 0) await this.sleep(waitMs);
    this.nextRequestAt = Date.now() + 350;
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
