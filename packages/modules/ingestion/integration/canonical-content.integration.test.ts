import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ContentRetentionPolicy, PrismaClient, SourceKind } from '@prisma/client';
import { CanonicalContentService } from '../src/canonical-content.service';
import { CanonicalCandidate } from '../src/source-adapter';

const prisma = new PrismaClient();

test('canonical persistence is idempotent and revisions precede current-content updates', async (context) => {
  const suffix = randomUUID().slice(0, 8);
  const source = await prisma.source.create({
    data: {
      name: `Canonical ${suffix}`,
      slug: `canonical-${suffix}`,
      kind: SourceKind.RSS,
      adapterKey: 'generic-rss-v2',
      baseUrl: 'https://publisher.test/feed.xml',
      defaultIntervalSec: 900,
      config: { sourceTier: 1, authorityScore: 0.95 },
    },
  });
  const raw = await prisma.rawSourcePayload.create({
    data: {
      sourceId: source.id,
      requestUrl: source.baseUrl!,
      payloadHash: 'b'.repeat(64),
      fetchedAt: new Date('2026-08-14T08:00:00Z'),
      retentionPolicy: ContentRetentionPolicy.FULL_TEXT,
      payload: Buffer.from('<rss/>'),
    },
  });
  context.after(async () => {
    await prisma.canonicalContent.deleteMany({ where: { sourceId: source.id } });
    await prisma.rawSourcePayload.deleteMany({ where: { sourceId: source.id } });
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.$disconnect();
  });
  const service = new CanonicalContentService(prisma as never);
  const originalPublishedAt = new Date('2026-08-14T07:00:00Z');
  const candidate: CanonicalCandidate = {
    sourceId: source.id,
    canonicalUrlCandidate: 'https://publisher.test/articles/one',
    externalId: 'article-one',
    originalTitle: '  Market   update ',
    originalContent: 'Value increased 2%.',
    originalExcerpt: 'Value increased 2%.',
    sourceLanguageCandidate: 'en',
    publishedAtCandidate: originalPublishedAt,
    publisher: 'Publisher',
    topicHints: ['finance'],
    marketHints: ['GLOBAL'],
    rawEvidence: [{ rawPayloadId: raw.id, payloadHash: raw.payloadHash, path: 'rss.item[0]' }],
    fetchedAt: raw.fetchedAt,
  };

  const first = await service.persist(candidate, {
    valid: true,
    errors: [],
    verifiedAt: new Date('2026-08-14T08:01:00Z'),
  });
  const repeated = await service.persist({ ...candidate, originalTitle: 'Market update' });
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.revised, false);

  const changed = await service.persist({
    ...candidate,
    originalContent: 'Value increased 3%.',
    originalExcerpt: 'Value increased 3%.',
    publishedAtCandidate: new Date('2026-08-15T07:00:00Z'),
    sourceUpdatedAtCandidate: new Date('2026-08-14T09:00:00Z'),
  });
  assert.equal(changed.revised, true);
  const stored = await prisma.canonicalContent.findUniqueOrThrow({
    where: { id: first.id },
    include: { revisions: true },
  });
  assert.equal(stored.originalContent, 'Value increased 3%.');
  assert.equal(stored.publishedAt.toISOString(), originalPublishedAt.toISOString());
  assert.equal(stored.updatedAtFromSource?.toISOString(), '2026-08-14T09:00:00.000Z');
  assert.equal(stored.revisions.length, 1);
  assert.equal(stored.revisions[0]?.originalContent, 'Value increased 2%.');
});
