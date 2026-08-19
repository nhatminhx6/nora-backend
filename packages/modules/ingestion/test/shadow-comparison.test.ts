import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareShadowFeeds, ShadowFeedItem } from '../src/shadow-comparison.service';

const item = (id: string, overrides: Partial<ShadowFeedItem> = {}): ShadowFeedItem => ({
  id,
  url: `https://example.com/${id}`,
  publisher: `publisher-${id}`,
  publishedAt: new Date('2026-08-14T00:00:00Z'),
  relevanceScore: 0.8,
  localized: true,
  blockingLocalizationError: false,
  duplicateKey: id,
  ...overrides,
});

test('shadow gate passes when v2 preserves quality and coverage', () => {
  const report = compareShadowFeeds(
    [item('1'), item('2')],
    [item('a'), item('b')],
    new Date('2026-08-14T01:00:00Z'),
  );
  assert.equal(report.decision, 'GO');
  assert.deepEqual(report.blockers, []);
  assert.equal(report.v2.requestUnits, 1);
});

test('shadow gate blocks quality regressions and localization leaks', () => {
  const report = compareShadowFeeds(
    [item('1'), item('2')],
    [
      item('a', { url: null, duplicateKey: 'same', blockingLocalizationError: true }),
      item('b', { duplicateKey: 'same', localized: false }),
    ],
  );
  assert.equal(report.decision, 'NO_GO');
  assert.deepEqual(report.blockers, [
    'BROKEN_URL_RATE_INCREASED',
    'DUPLICATE_RATE_INCREASED',
    'BLOCKING_LOCALIZATION_ERROR_LEAKED',
  ]);
});
