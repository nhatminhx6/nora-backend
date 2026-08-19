import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LOCALIZATION_V3_JSON_SCHEMA,
  LocalizationV3Provider,
  LocalizationV3ProviderResult,
  LocalizationV3Request,
} from './localization-v3.contract';

@Injectable()
export class OpenAiLocalizationV3Provider implements LocalizationV3Provider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY')?.trim() ?? '';
    this.model = config.get<string>('OPENAI_TRANSLATION_MODEL', 'gpt-5.6-luna');
  }

  async generateLocalization(
    request: LocalizationV3Request,
  ): Promise<LocalizationV3ProviderResult> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY_MISSING');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'nora_localization_v3',
            strict: true,
            schema: LOCALIZATION_V3_JSON_SCHEMA,
          },
        },
        input: [
          {
            role: 'system',
            content:
              'Localize source-grounded news. Do not add facts or financial, medical, or legal advice. Preserve every supplied value, protected term, attribution, certainty, direction, and causal relationship. Write a natural non-clickbait headline. Every claim must cite one or more exact source evidence spans.',
          },
          { role: 'user', content: JSON.stringify(request) },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`OPENAI_LOCALIZATION_HTTP_${response.status}`);
    const payload = (await response.json()) as { output_text?: string };
    if (!payload.output_text) throw new Error('OPENAI_LOCALIZATION_EMPTY');
    let output: unknown;
    try {
      output = JSON.parse(payload.output_text);
    } catch {
      throw new Error('OPENAI_LOCALIZATION_SCHEMA_INVALID');
    }
    return { output, provider: 'openai', model: this.model };
  }
}
