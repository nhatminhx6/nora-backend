import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentProvenanceStatus, ContentRetentionPolicy, SourceKind } from '@prisma/client';
import {
  ProvenanceValidatorService,
  samePublisherDomain,
} from '../src/provenance-validator.service';
import { CanonicalCandidate } from '../src/source-adapter';
import { SourceProfile } from '../src/source-profile';

const validator = new ProvenanceValidatorService();
const profile: SourceProfile = {
  name: 'Publisher',
  slug: 'publisher-rss',
  feedUrl: 'https://www.publisher.test/feed.xml',
  adapterKey: 'generic-rss-v2',
  kind: SourceKind.RSS,
  language: 'en',
  markets: ['GLOBAL'],
  topics: ['technology'],
  sourceTier: 1,
  authorityScore: 1,
  licensePolicy: ContentRetentionPolicy.EXCERPT_ONLY,
  updateIntervalSec: 900,
  verificationPolicy: 'https-article-same-publisher-v1',
  selectionPolicy: 'ALL_ITEMS',
  enabled: true,
};
const candidate: CanonicalCandidate = {
  sourceId: '00000000-0000-0000-0000-000000000001',
  canonicalUrlCandidate: 'https://publisher.test/articles/policy-update',
  externalId: 'article-1',
  originalTitle: 'Publisher announces important policy update',
  originalContent:
    'Publisher announced an important policy update today with detailed guidance for developers and customers across global markets.',
  originalExcerpt: 'Publisher announced an important policy update today.',
  sourceLanguageCandidate: 'en',
  publishedAtCandidate: new Date('2026-08-14T07:00:00Z'),
  publisher: 'Publisher',
  topicHints: ['technology'],
  marketHints: ['GLOBAL'],
  rawEvidence: [{ payloadHash: 'a'.repeat(64), path: 'rss.item[0]' }],
  fetchedAt: new Date('2026-08-14T08:00:00Z'),
};

test('verifies a matching 2xx detail page after same-publisher redirect', async () => {
  const result = await validator.validate(candidate, profile, async () =>
    responseWithUrl(
      '<html><h1>Publisher announces important policy update</h1><p>Detailed guidance for developers and customers across global markets.</p></html>',
      200,
      'https://news.publisher.test/articles/policy-update',
    ),
  );
  assert.equal(result.status, ContentProvenanceStatus.VERIFIED);
  assert.equal(result.httpStatus, 200);
  assert.ok(result.verifiedAt);
});

test('RSS discovery does not verify when detail URL returns 403', async () => {
  const result = await validator.validate(candidate, profile, async () =>
    responseWithUrl('Forbidden', 403, candidate.canonicalUrlCandidate),
  );
  assert.equal(result.status, ContentProvenanceStatus.REJECTED);
  assert.deepEqual(result.errors, ['HTTP_403']);
  assert.equal(result.verifiedAt, undefined);
});

test('rejects cross-publisher redirects and missing source policy', async () => {
  const redirected = await validator.validate(candidate, profile, async () =>
    responseWithUrl(
      '<h1>Publisher announces important policy update</h1>',
      200,
      'https://evil.test/a',
    ),
  );
  assert.equal(redirected.status, ContentProvenanceStatus.REJECTED);
  assert.ok(redirected.errors.includes('UNEXPECTED_FINAL_DOMAIN'));

  const invalidProfile = {
    ...profile,
    sourceTier: 7,
    licensePolicy: 'MISSING',
  } as unknown as SourceProfile;
  const invalid = await validator.validate(candidate, invalidProfile);
  assert.equal(invalid.status, ContentProvenanceStatus.REJECTED);
  assert.ok(invalid.errors.includes('SOURCE_TIER_INVALID'));
  assert.ok(invalid.errors.includes('LICENSE_POLICY_MISSING'));
});

test('sends content mismatch or low language confidence to review', async () => {
  const result = await validator.validate(
    { ...candidate, originalContent: 'Short text' },
    profile,
    async () =>
      responseWithUrl(
        '<html>Completely unrelated page</html>',
        200,
        candidate.canonicalUrlCandidate,
      ),
  );
  assert.equal(result.status, ContentProvenanceStatus.NEEDS_REVIEW);
  assert.ok(result.errors.includes('DETAIL_CONTENT_MISMATCH'));
  assert.ok(result.errors.includes('LANGUAGE_CONFIDENCE_LOW'));
});

test('publisher domain comparison permits www and subdomains only', () => {
  assert.equal(samePublisherDomain('news.publisher.test', 'www.publisher.test'), true);
  assert.equal(samePublisherDomain('publisher.test.evil.test', 'publisher.test'), false);
});

function responseWithUrl(body: string, status: number, url: string): Response {
  const response = new Response(body, { status, headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}
