import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalizationQualityValidator } from '../src/localization-quality.validator';

const validator = new LocalizationQualityValidator();

test('accepts Vietnamese localization preserving numbers and entities', () => {
  const result = validator.validate({
    sourceTitle: 'XRP falls 5.5% after Senate delay',
    sourceContent: 'XRP fell 5.5% while Bitcoin remained stable.',
    localizedTitle: 'XRP giảm 5.5% sau khi Thượng viện trì hoãn',
    localizedContent: 'XRP giảm 5.5% trong khi Bitcoin giữ ổn định.',
    sourceLocale: 'en',
    targetLocale: 'vi',
  });
  assert.equal(result.passed, true);
  assert.equal(result.score, 1);
});

test('rejects untranslated content and changed figures', () => {
  const result = validator.validate({
    sourceTitle: 'XRP falls 5.5% after Senate delay',
    sourceContent: 'XRP fell 5.5% while Bitcoin remained stable.',
    localizedTitle: 'XRP falls 4% after Senate delay',
    localizedContent: 'XRP fell 4% while Bitcoin remained stable.',
    sourceLocale: 'en',
    targetLocale: 'vi',
  });
  assert.equal(result.passed, false);
  assert.ok(result.failureReasons.includes('NUMBER_CHANGED'));
  assert.ok(result.failureReasons.includes('LOCALE_FALLBACK_LEAK'));
});
