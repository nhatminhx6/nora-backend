import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient, SourceKind } from '@prisma/client';
import {
  DETERMINISTIC_EXTRACTION_VERSION,
  DeterministicClaimExtractorService,
} from '../src/deterministic-claim-extractor.service';

const prisma = new PrismaClient();

test('claim extraction persists idempotent evidence and preservation metadata', async (context) => {
  const suffix = randomUUID().slice(0, 8);
  const source = await prisma.source.create({
    data: {
      name: `Claims ${suffix}`,
      slug: `claims-${suffix}`,
      kind: SourceKind.RSS,
      adapterKey: 'generic-rss-v2',
      defaultIntervalSec: 900,
    },
  });
  const content = await prisma.canonicalContent.create({
    data: {
      sourceId: source.id,
      canonicalUrl: `https://claims-${suffix}.test/article`,
      externalId: 'claims-article',
      contentHash: 'd'.repeat(64),
      originalTitle: 'OpenAI launches GPT-5',
      originalContent:
        'According to OpenAI, GPT-5 may increase throughput by 25% on 2026-08-14 with USD 2.5 million in funding.',
      sourceLanguage: 'en',
      publisher: 'OpenAI',
      publishedAt: new Date('2026-08-14T07:00:00Z'),
      sourceTier: 1,
      authorityScore: 1,
    },
  });
  context.after(async () => {
    await prisma.canonicalContent.delete({ where: { id: content.id } });
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.$disconnect();
  });
  const service = new DeterministicClaimExtractorService(prisma as never);
  const extraction = await service.extractAndPersist(content.id);
  await service.extractAndPersist(content.id);
  const claims = await prisma.contentClaim.findMany({
    where: { canonicalContentId: content.id, extractionVersion: DETERMINISTIC_EXTRACTION_VERSION },
  });
  assert.equal(claims.length, extraction.claims.length);
  assert.ok(claims.some((claim) => claim.entities.includes('GPT-5')));
  assert.ok(claims.some((claim) => claim.dates.length === 1));
  const metadata = claims.find((claim) => claim.text.includes('25%'))?.metadata as {
    preservationConstraints: string[];
  };
  assert.ok(metadata.preservationConstraints.includes('25%'));
  assert.ok(metadata.preservationConstraints.includes('USD 2.5 million'));
});
