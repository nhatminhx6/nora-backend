import { KnownLocale, isKnownLocale } from '@nora/common';

export const LOCALIZATION_POLICY_V3 = 'localization-policy-v3';

export interface LocalizationV3Claim {
  text: string;
  evidence: string[];
}

export interface LocalizationV3Output {
  title: string;
  summary: string;
  claims: LocalizationV3Claim[];
  preservedValues: string[];
  preservedTerms: string[];
  sourceLanguage: KnownLocale;
  targetLocale: KnownLocale;
}

export interface LocalizationV3Request {
  sourceTitle: string;
  sourceContent: string;
  sourceClaims: Array<{ text: string; evidence: string[] }>;
  preservedValues: string[];
  preservedTerms: string[];
  glossary: Array<{ sourceTerm: string; preferredTerm: string; protected: boolean }>;
  sourceLanguage: KnownLocale;
  targetLocale: KnownLocale;
  policyVersion: string;
  glossaryVersion: string;
}

export interface LocalizationV3ProviderResult {
  output: unknown;
  provider: string;
  model: string;
}

export interface LocalizationV3Provider {
  generateLocalization(request: LocalizationV3Request): Promise<LocalizationV3ProviderResult>;
}

export const LOCALIZATION_V3_PROVIDER = Symbol('LOCALIZATION_V3_PROVIDER');

export function parseLocalizationV3Output(
  value: unknown,
  context: Pick<
    LocalizationV3Request,
    | 'sourceTitle'
    | 'sourceContent'
    | 'preservedValues'
    | 'preservedTerms'
    | 'sourceLanguage'
    | 'targetLocale'
  >,
): LocalizationV3Output {
  if (!record(value)) throw new Error('LOCALIZATION_SCHEMA_INVALID');
  assertExactKeys(value, [
    'title',
    'summary',
    'claims',
    'preservedValues',
    'preservedTerms',
    'sourceLanguage',
    'targetLocale',
  ]);
  const title = requiredString(value.title);
  const summary = requiredString(value.summary);
  if (
    !Array.isArray(value.claims) ||
    !Array.isArray(value.preservedValues) ||
    !Array.isArray(value.preservedTerms)
  )
    throw new Error('LOCALIZATION_SCHEMA_INVALID');
  const claims = value.claims.map((claim) => {
    if (!record(claim) || !Array.isArray(claim.evidence))
      throw new Error('LOCALIZATION_SCHEMA_INVALID');
    assertExactKeys(claim, ['text', 'evidence']);
    return { text: requiredString(claim.text), evidence: claim.evidence.map(requiredString) };
  });
  const preservedValues = value.preservedValues.map(requiredString);
  const preservedTerms = value.preservedTerms.map(requiredString);
  if (claims.length === 0) throw new Error('LOCALIZATION_SCHEMA_INVALID');
  if (!isKnownLocale(value.sourceLanguage) || !isKnownLocale(value.targetLocale))
    throw new Error('LOCALIZATION_SCHEMA_INVALID');
  if (
    value.sourceLanguage !== context.sourceLanguage ||
    value.targetLocale !== context.targetLocale
  )
    throw new Error('LOCALIZATION_LOCALE_MISMATCH');
  const retainedSource = `${context.sourceTitle}\n${context.sourceContent}`;
  if (claims.some((claim) => claim.evidence.length === 0))
    throw new Error('LOCALIZATION_EVIDENCE_REQUIRED');
  if (
    claims.flatMap((claim) => claim.evidence).some((evidence) => !retainedSource.includes(evidence))
  )
    throw new Error('LOCALIZATION_EVIDENCE_NOT_IN_SOURCE');
  if (!sameSet(preservedValues, context.preservedValues))
    throw new Error('LOCALIZATION_VALUES_NOT_PRESERVED');
  if (!sameSet(preservedTerms, context.preservedTerms))
    throw new Error('LOCALIZATION_TERMS_NOT_PRESERVED');
  return {
    title,
    summary,
    claims,
    preservedValues: [...new Set(preservedValues)],
    preservedTerms: [...new Set(preservedTerms)],
    sourceLanguage: value.sourceLanguage,
    targetLocale: value.targetLocale,
  };
}

export const LOCALIZATION_V3_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'summary',
    'claims',
    'preservedValues',
    'preservedTerms',
    'sourceLanguage',
    'targetLocale',
  ],
  properties: {
    title: { type: 'string', minLength: 1 },
    summary: { type: 'string', minLength: 1 },
    claims: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'evidence'],
        properties: {
          text: { type: 'string', minLength: 1 },
          evidence: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
        },
      },
    },
    preservedValues: { type: 'array', items: { type: 'string' } },
    preservedTerms: { type: 'array', items: { type: 'string' } },
    sourceLanguage: { type: 'string', enum: ['vi', 'en', 'zh-Hans'] },
    targetLocale: { type: 'string', enum: ['vi', 'en', 'zh-Hans'] },
  },
} as const;

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('LOCALIZATION_SCHEMA_INVALID');
  return value.trim();
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((item) => rightSet.has(item));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('LOCALIZATION_SCHEMA_INVALID');
}
