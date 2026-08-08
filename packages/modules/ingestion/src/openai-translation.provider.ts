import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranslationLocale, TranslationProvider, TranslationResult } from './translation-provider';

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}

@Injectable()
export class OpenAiTranslationProvider implements TranslationProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY')?.trim() ?? '';
    this.model = config.get<string>('OPENAI_TRANSLATION_MODEL', 'gpt-5.6-luna');
  }

  async translate(
    value: string,
    source: TranslationLocale,
    target: TranslationLocale,
  ): Promise<TranslationResult> {
    if (source === target)
      return { text: value, provider: 'source-original', model: 'source-original' };
    if (!this.apiKey) throw new Error('OPENAI_API_KEY_MISSING');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: 'low' },
        input: [
          {
            role: 'system',
            content:
              'Translate source-grounded Nora content. Return translation only. Preserve names, tickers, dates, numbers, currencies, percentages, negation, uncertainty and attribution. Never add facts or advice.',
          },
          { role: 'user', content: `Translate from ${source} to ${target}:\n${value}` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OPENAI_TRANSLATION_HTTP_${response.status}`);
    const payload = (await response.json()) as OpenAiResponse;
    const text =
      payload.output_text?.trim() ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === 'output_text')
        ?.text?.trim();
    if (!text) throw new Error('OPENAI_TRANSLATION_EMPTY');
    return { text, provider: 'openai', model: this.model };
  }
}
