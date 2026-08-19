import { KnownLocale } from '@nora/common';
import { LocalizationV3Claim } from './localization-v3.contract';

export const LOCALIZATION_QUALITY_POLICY_V3 = 'localization-quality-v3';
export const LOCALIZATION_SEMANTIC_VERIFIER = Symbol('LOCALIZATION_SEMANTIC_VERIFIER');

export const LOCALIZATION_BLOCKING_ERRORS = [
  'NUMBER_CHANGED',
  'CURRENCY_CHANGED',
  'DATE_CHANGED',
  'ENTITY_CORRUPTED',
  'DIRECTION_REVERSED',
  'CERTAINTY_CHANGED',
  'ATTRIBUTION_DROPPED',
  'MISSING_EVIDENCE',
  'EVIDENCE_NOT_IN_SOURCE',
  'LOCALE_FALLBACK_LEAK',
  'EMPTY_OUTPUT',
  'GLOSSARY_VIOLATION',
] as const;

export type LocalizationBlockingError = (typeof LOCALIZATION_BLOCKING_ERRORS)[number];

export interface LocalizationQualityV3Input {
  sourceTitle: string;
  sourceContent: string;
  localizedTitle: string;
  localizedSummary: string;
  localizedClaims: LocalizationV3Claim[];
  sourceLanguage: KnownLocale;
  targetLocale: KnownLocale;
  glossary: Array<{ sourceTerm: string; preferredTerm: string; protected: boolean }>;
}

export interface SemanticVerificationRequest extends LocalizationQualityV3Input {
  highStakes: boolean;
}

export interface SemanticVerificationResult {
  passed: boolean;
  score: number;
  reasons: string[];
  provider: string;
  model: string;
}

export interface LocalizationSemanticVerifier {
  verify(request: SemanticVerificationRequest): Promise<SemanticVerificationResult>;
}
