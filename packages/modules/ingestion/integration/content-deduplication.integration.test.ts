import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient, SourceKind } from '@prisma/client';
import { ContentDeduplicationService } from '../src/content-deduplication.service';

const prisma = new PrismaClient();

test('dedup keeps records and deterministically reparents them to the earliest survivor', async (context) => {
  const suffix = randomUUID().slice(0, 8);
  const sources = await Promise.all(
    [1, 2, 3].map((index) =>
      prisma.source.create({
        data: {
          name: `Dedupe ${suffix} ${index}`,
          slug: `dedupe-${suffix}-${index}`,
          kind: SourceKind.RSS,
          adapterKey: 'generic-rss-v2',
          defaultIntervalSec: 900,
        },
      }),
    ),
  );
  context.after(async () => {
    await prisma.canonicalContent.deleteMany({
      where: { sourceId: { in: sources.map((s) => s.id) } },
    });
    await prisma.source.deleteMany({ where: { id: { in: sources.map((s) => s.id) } } });
    await prisma.$disconnect();
  });
  const createContent = (sourceId: string, publishedAt: string, sequence: number) =>
    prisma.canonicalContent.create({
      data: {
        sourceId,
        canonicalUrl: `https://publisher-${sequence}.test/articles/policy`,
        externalId: `policy-${sequence}`,
        contentHash: 'c'.repeat(64),
        originalTitle: 'Shared policy announcement',
        originalContent: 'The same exact policy content with figures 2% and date 14/08/2026.',
        sourceLanguage: 'en',
        publisher: `Publisher ${sequence}`,
        publishedAt: new Date(publishedAt),
        sourceTier: 1,
        authorityScore: 1,
      },
    });
  const middle = await createContent(sources[0]!.id, '2026-08-14T07:00:00Z', 1);
  const latest = await createContent(sources[1]!.id, '2026-08-14T08:00:00Z', 2);
  const service = new ContentDeduplicationService(prisma as never);
  await service.evaluate(latest.id);
  assert.equal(
    (await prisma.canonicalContent.findUniqueOrThrow({ where: { id: latest.id } })).duplicateOfId,
    middle.id,
  );

  const earliest = await createContent(sources[2]!.id, '2026-08-14T06:00:00Z', 3);
  await service.evaluate(earliest.id);
  const records = await prisma.canonicalContent.findMany({
    where: { id: { in: [earliest.id, middle.id, latest.id] } },
  });
  assert.equal(records.find((item) => item.id === earliest.id)?.duplicateOfId, null);
  assert.equal(records.find((item) => item.id === middle.id)?.duplicateOfId, earliest.id);
  assert.equal(records.find((item) => item.id === latest.id)?.duplicateOfId, earliest.id);
  assert.equal(records.length, 3);
});
