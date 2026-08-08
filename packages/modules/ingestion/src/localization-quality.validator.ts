import { Injectable } from '@nestjs/common';

export interface LocalizationQualityInput {
  sourceTitle: string;
  sourceContent: string;
  localizedTitle: string;
  localizedContent: string;
  sourceLocale: 'vi' | 'en';
  targetLocale: 'vi' | 'en';
}

export interface LocalizationQualityResult {
  passed: boolean;
  score: number;
  failureReasons: string[];
  evidence: Array<{ claim: 'title' | 'summary'; sourceText: string }>;
}

@Injectable()
export class LocalizationQualityValidator {
  validate(input: LocalizationQualityInput): LocalizationQualityResult {
    const failures: string[] = [];
    const source = `${input.sourceTitle} ${input.sourceContent}`;
    const localized = `${input.localizedTitle} ${input.localizedContent}`;
    const sourceNumbers = this.tokens(source, /\d+(?:[.,]\d+)*(?:%|\s?(?:USD|VND|BTC|ETH))?/giu);
    const localizedNumbers = new Set(
      this.tokens(localized, /\d+(?:[.,]\d+)*(?:%|\s?(?:USD|VND|BTC|ETH))?/giu),
    );
    if (sourceNumbers.some((token) => !localizedNumbers.has(token)))
      failures.push('NUMBER_CHANGED');

    const protectedTerms = this.tokens(
      source,
      /\b(?:[A-Z]{2,8}|Bitcoin|Ethereum|OpenAI|Apple|Google|Microsoft|XRP)\b/gu,
    );
    if (protectedTerms.some((term) => !localized.includes(term))) failures.push('ENTITY_CORRUPTED');
    if (!input.localizedTitle.trim() || !input.localizedContent.trim())
      failures.push('EMPTY_OUTPUT');
    if (input.sourceLocale !== input.targetLocale && localized.trim() === source.trim())
      failures.push('LOCALE_FALLBACK_LEAK');
    if (input.targetLocale === 'vi' && this.englishLeakRatio(localized) > 0.82)
      failures.push('LOCALE_FALLBACK_LEAK');

    const score = Math.max(0, 1 - failures.length * 0.25);
    return {
      passed: failures.length === 0 && score >= 0.9,
      score,
      failureReasons: failures,
      evidence: [
        { claim: 'title', sourceText: input.sourceTitle },
        { claim: 'summary', sourceText: input.sourceContent },
      ],
    };
  }

  private tokens(value: string, pattern: RegExp): string[] {
    return [...new Set(value.match(pattern) ?? [])];
  }

  private englishLeakRatio(value: string): number {
    const words = value.match(/[A-Za-zÀ-ỹ]+/gu) ?? [];
    if (words.length < 8) return 0;
    const englishMarkers = new Set([
      'the',
      'and',
      'as',
      'while',
      'with',
      'from',
      'this',
      'that',
      'was',
      'were',
      'has',
      'have',
      'after',
      'before',
      'fell',
      'falls',
      'rose',
      'rises',
      'remained',
      'stable',
      'delay',
    ]);
    const matches = words.filter((word) => englishMarkers.has(word.toLowerCase())).length;
    return matches / Math.max(1, words.length / 8);
  }
}
