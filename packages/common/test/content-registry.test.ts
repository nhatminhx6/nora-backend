import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  defaultMarketPreferences,
  normalizeLocale,
  parseLocale,
  parseMarketPreferences,
} from '../src';

test('normalizes Vietnamese and English BCP-47 locale inputs', () => {
  assert.equal(normalizeLocale('vi-VN'), 'vi');
  assert.equal(normalizeLocale('en-US'), 'en');
});

test('recognizes zh-CN as zh-Hans but keeps it disabled by default', () => {
  assert.equal(normalizeLocale('zh-CN'), 'zh-Hans');
  assert.deepEqual(parseLocale('zh-CN'), {
    ok: false,
    code: 'LOCALE_DISABLED',
    locale: 'zh-Hans',
    enabled: false,
  });
  assert.deepEqual(parseLocale('zh-CN', { zhHansEnabled: true }), {
    ok: true,
    locale: 'zh-Hans',
    enabled: true,
  });
});

test('rejects unknown, malformed and traditional Chinese locales', () => {
  assert.equal(parseLocale('fr-FR').ok, false);
  assert.equal(parseLocale('not_a_locale').ok, false);
  assert.equal(parseLocale('zh-TW').ok, false);
});

test('keeps presentation locale independent from market preferences', () => {
  const locale = parseLocale('vi-VN');
  const markets = parseMarketPreferences({
    homeMarket: 'global',
    followedMarkets: ['US', 'GLOBAL', 'us'],
  });

  assert.deepEqual(locale, { ok: true, locale: 'vi', enabled: true });
  assert.deepEqual(markets, {
    ok: true,
    preferences: { homeMarket: 'GLOBAL', followedMarkets: ['US'] },
  });
  assert.deepEqual(defaultMarketPreferences('vi'), {
    homeMarket: 'VN',
    followedMarkets: ['GLOBAL'],
  });
});
