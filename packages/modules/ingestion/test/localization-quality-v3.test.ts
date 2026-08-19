import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalizationQualityV3Validator } from '../src/localization-quality-v3.validator';

const validator = new LocalizationQualityV3Validator();
const sourceContent =
  'According to OpenAI, GPT-5 may increase revenue by USD 25 million on 2026-08-14.';
const valid = {
  sourceTitle: 'OpenAI update',
  sourceContent,
  localizedTitle: 'Cập nhật từ OpenAI',
  localizedSummary: 'Theo OpenAI, GPT-5 có thể tăng doanh thu USD 25 million vào 2026-08-14.',
  localizedClaims: [
    { text: 'GPT-5 có thể tăng doanh thu USD 25 million.', evidence: [sourceContent] },
  ],
  sourceLanguage: 'en' as const,
  targetLocale: 'vi' as const,
  glossary: [{ sourceTerm: 'revenue', preferredTerm: 'doanh thu', protected: false }],
};

test('passes exact facts, direction, certainty, attribution, evidence and glossary', () => {
  assert.deepEqual(validator.validate(valid), { passed: true, score: 1, failureCodes: [] });
});

test('blocks changed numeric, currency and date facts', () => {
  const result = validator.validate({
    ...valid,
    localizedTitle: 'Cập nhật từ OpenAI',
    localizedSummary: 'Theo OpenAI, GPT-6 có thể tăng doanh thu USD 30 million vào 2026-08-15.',
    localizedClaims: [
      {
        text: 'GPT-6 có thể tăng doanh thu USD 30 million.',
        evidence: [sourceContent],
      },
    ],
  });
  assert.ok(result.failureCodes.includes('NUMBER_CHANGED'));
  assert.ok(result.failureCodes.includes('CURRENCY_CHANGED'));
  assert.ok(result.failureCodes.includes('DATE_CHANGED'));
});

test('blocks entity, direction, certainty and attribution corruption', () => {
  const result = validator.validate({
    ...valid,
    localizedTitle: 'Bản tin',
    localizedSummary: 'GPT-5 giảm doanh thu USD 25 million vào 2026-08-14.',
    localizedClaims: [
      {
        text: 'GPT-5 giảm doanh thu USD 25 million.',
        evidence: [sourceContent],
      },
    ],
  });
  assert.ok(result.failureCodes.includes('ENTITY_CORRUPTED'));
  assert.ok(result.failureCodes.includes('DIRECTION_REVERSED'));
  assert.ok(result.failureCodes.includes('CERTAINTY_CHANGED'));
  assert.ok(result.failureCodes.includes('ATTRIBUTION_DROPPED'));
});

test('blocks missing or invented evidence, locale fallback and glossary violations', () => {
  const missing = validator.validate({
    ...valid,
    localizedClaims: [{ text: 'x', evidence: [] }],
    localizedSummary: 'Theo OpenAI, GPT-5 có thể tăng USD 25 million vào 2026-08-14.',
  });
  assert.ok(missing.failureCodes.includes('MISSING_EVIDENCE'));
  assert.ok(missing.failureCodes.includes('GLOSSARY_VIOLATION'));
  const invented = validator.validate({
    ...valid,
    localizedClaims: [{ text: 'x', evidence: ['invented'] }],
  });
  assert.ok(invented.failureCodes.includes('EVIDENCE_NOT_IN_SOURCE'));
  const fallback = validator.validate({
    ...valid,
    localizedTitle: valid.sourceTitle,
    localizedSummary: valid.sourceContent,
    localizedClaims: [{ text: valid.sourceContent, evidence: [valid.sourceContent] }],
  });
  assert.ok(fallback.failureCodes.includes('LOCALE_FALLBACK_LEAK'));
});
