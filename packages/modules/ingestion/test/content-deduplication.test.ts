import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CanonicalContent } from '@prisma/client';
import {
  classifyDuplicate,
  isLocalizationEligible,
  normalizedFingerprint,
} from '../src/content-deduplication.service';

test('classifies source identity, canonical URL and exact content hash in priority order', () => {
  const base = content();
  assert.equal(classifyDuplicate(base, { ...base }).kind, 'SOURCE_EXTERNAL_ID');
  assert.equal(
    classifyDuplicate(base, { ...base, sourceId: 'other', externalId: 'other' }).kind,
    'CANONICAL_URL',
  );
  assert.equal(
    classifyDuplicate(base, {
      ...base,
      sourceId: 'other',
      externalId: 'other',
      canonicalUrl: 'https://other.test/story',
    }).kind,
    'EXACT_CONTENT_HASH',
  );
});

test('normalizes punctuation and whitespace into the same fingerprint', () => {
  assert.equal(
    normalizedFingerprint('Policy—update: 2%'),
    normalizedFingerprint('Policy update  2%'),
  );
});

test('near-exact classifier catches formatting variation', () => {
  const left = content();
  const right = {
    ...content(),
    sourceId: 'other',
    externalId: 'other',
    canonicalUrl: 'https://other.test/story',
    contentHash: 'other',
    originalContent: `${left.originalContent} updated`,
  };
  const decision = classifyDuplicate(left, right);
  assert.equal(decision.kind, 'NEAR_EXACT');
  assert.ok(decision.score >= 0.9);
});

test('does not merge same-looking stories when number, date or entity differs', () => {
  const base = content();
  for (const [title, body] of [
    ['Federal Reserve raises rate 3%', base.originalContent],
    [base.originalTitle, base.originalContent!.replace('14/08/2026', '15/08/2026')],
    [base.originalTitle.replace('Federal Reserve', 'European Central Bank'), base.originalContent],
  ] as const) {
    const decision = classifyDuplicate(base, {
      ...base,
      sourceId: 'other',
      externalId: 'other',
      canonicalUrl: `https://other.test/${encodeURIComponent(title)}`,
      contentHash: 'other',
      originalTitle: title,
      originalContent: body,
    });
    assert.equal(decision.duplicate, false);
  }
});

test('only verified canonical survivors may continue to localization', () => {
  assert.equal(isLocalizationEligible({ provenanceStatus: 'VERIFIED', duplicateOfId: null }), true);
  assert.equal(
    isLocalizationEligible({ provenanceStatus: 'REJECTED', duplicateOfId: null }),
    false,
  );
  assert.equal(
    isLocalizationEligible({ provenanceStatus: 'NEEDS_REVIEW', duplicateOfId: null }),
    false,
  );
  assert.equal(
    isLocalizationEligible({ provenanceStatus: 'VERIFIED', duplicateOfId: 'survivor' }),
    false,
  );
});

function content(): CanonicalContent {
  return {
    id: 'left',
    sourceId: 'source',
    rawPayloadId: null,
    canonicalUrl: 'https://publisher.test/story',
    externalId: 'story',
    contentHash: 'hash',
    originalTitle: 'Federal Reserve raises rate 2%',
    originalContent:
      'Federal Reserve officials raised the benchmark interest rate by 2% on 14/08/2026 after reviewing inflation and employment data across the United States economy.',
    originalExcerpt: null,
    sourceLanguage: 'en',
    publisher: 'Publisher',
    author: null,
    publishedAt: new Date('2026-08-14T07:00:00Z'),
    updatedAtFromSource: null,
    verifiedAt: null,
    status: 'PENDING',
    provenanceStatus: 'PENDING',
    markets: [],
    topics: [],
    sourceTier: 1,
    authorityScore: { toString: () => '1' } as never,
    duplicateOfId: null,
    duplicateKind: null,
    duplicateScore: null,
    metadata: {},
    createdAt: new Date('2026-08-14T08:00:00Z'),
    updatedAt: new Date('2026-08-14T08:00:00Z'),
  };
}
