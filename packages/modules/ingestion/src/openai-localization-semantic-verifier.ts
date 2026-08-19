import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LocalizationSemanticVerifier,
  SemanticVerificationRequest,
  SemanticVerificationResult,
} from './localization-quality-v3.contract';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['passed', 'score', 'reasons'],
  properties: {
    passed: { type: 'boolean' },
    score: { type: 'number', minimum: 0, maximum: 1 },
    reasons: { type: 'array', items: { type: 'string' } },
  },
} as const;

@Injectable()
export class OpenAiLocalizationSemanticVerifier implements LocalizationSemanticVerifier {
  private readonly apiKey: string;
  private readonly model: string;
  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY')?.trim() ?? '';
    this.model = config.get<string>('OPENAI_LOCALIZATION_VERIFIER_MODEL', 'gpt-5.6-luna');
  }

  async verify(request: SemanticVerificationRequest): Promise<SemanticVerificationResult> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY_MISSING');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: request.highStakes ? 'high' : 'medium' },
        text: {
          format: {
            type: 'json_schema',
            name: 'nora_localization_verifier_v3',
            strict: true,
            schema: SCHEMA,
          },
        },
        input: [
          {
            role: 'system',
            content:
              'Independently verify that the localization preserves every source fact, attribution, certainty, direction, causality, and safety meaning without adding advice or claims. Score conservatively. High-stakes content requires stronger scrutiny.',
          },
          { role: 'user', content: JSON.stringify(request) },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`OPENAI_SEMANTIC_VERIFIER_HTTP_${response.status}`);
    const payload = (await response.json()) as { output_text?: string };
    if (!payload.output_text) throw new Error('OPENAI_SEMANTIC_VERIFIER_EMPTY');
    const parsed = JSON.parse(payload.output_text) as Partial<SemanticVerificationResult>;
    if (
      typeof parsed.passed !== 'boolean' ||
      typeof parsed.score !== 'number' ||
      parsed.score < 0 ||
      parsed.score > 1 ||
      !Array.isArray(parsed.reasons) ||
      parsed.reasons.some((reason) => typeof reason !== 'string')
    )
      throw new Error('OPENAI_SEMANTIC_VERIFIER_SCHEMA_INVALID');
    return {
      passed: parsed.passed,
      score: parsed.score,
      reasons: parsed.reasons as string[],
      provider: 'openai',
      model: this.model,
    };
  }
}
