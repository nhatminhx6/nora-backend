import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLocalizationV3Output } from '../src/localization-v3.contract';

const context = {
  sourceTitle: 'OpenAI launches GPT-5',
  sourceContent: 'OpenAI said GPT-5 may increase throughput by 25%.',
  preservedValues: ['25%', 'may'],
  preservedTerms: ['OpenAI', 'GPT-5'],
  sourceLanguage: 'en' as const,
  targetLocale: 'vi' as const,
};
const valid = {
  title: 'OpenAI ra mắt GPT-5',
  summary: 'OpenAI cho biết GPT-5 có thể tăng thông lượng thêm 25%.',
  claims: [
    {
      text: 'GPT-5 có thể tăng thông lượng thêm 25%.',
      evidence: ['OpenAI said GPT-5 may increase throughput by 25%.'],
    },
  ],
  preservedValues: ['25%', 'may'],
  preservedTerms: ['OpenAI', 'GPT-5'],
  sourceLanguage: 'en',
  targetLocale: 'vi',
};

test('accepts strict structured localization with exact retained evidence', () => {
  assert.deepEqual(parseLocalizationV3Output(valid, context), valid);
});

test('rejects extra fields, locale mismatch and malformed claims', () => {
  assert.throws(
    () => parseLocalizationV3Output({ ...valid, advice: 'buy now' }, context),
    /LOCALIZATION_SCHEMA_INVALID/,
  );
  assert.throws(
    () => parseLocalizationV3Output({ ...valid, targetLocale: 'en' }, context),
    /LOCALIZATION_LOCALE_MISMATCH/,
  );
  assert.throws(
    () =>
      parseLocalizationV3Output(
        { ...valid, claims: [{ text: 'x', evidence: [], extra: true }] },
        context,
      ),
    /LOCALIZATION_SCHEMA_INVALID/,
  );
  assert.throws(
    () => parseLocalizationV3Output({ ...valid, claims: [] }, context),
    /LOCALIZATION_SCHEMA_INVALID/,
  );
});

test('rejects invented evidence and changed preservation sets before persistence', () => {
  assert.throws(
    () =>
      parseLocalizationV3Output(
        { ...valid, claims: [{ text: 'x', evidence: ['invented source'] }] },
        context,
      ),
    /LOCALIZATION_EVIDENCE_NOT_IN_SOURCE/,
  );
  assert.throws(
    () => parseLocalizationV3Output({ ...valid, preservedValues: ['30%', 'may'] }, context),
    /LOCALIZATION_VALUES_NOT_PRESERVED/,
  );
  assert.throws(
    () => parseLocalizationV3Output({ ...valid, preservedTerms: ['OpenAI'] }, context),
    /LOCALIZATION_TERMS_NOT_PRESERVED/,
  );
});
