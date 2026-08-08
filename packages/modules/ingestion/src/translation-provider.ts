export type TranslationLocale = 'vi' | 'en';

export interface TranslationResult {
  text: string;
  provider: string;
  model: string;
}

export interface TranslationProvider {
  translate(
    value: string,
    source: TranslationLocale,
    target: TranslationLocale,
  ): Promise<TranslationResult>;
}

export const TRANSLATION_PROVIDER = Symbol('TRANSLATION_PROVIDER');
