import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  ContentClusterStatus,
  ContentProvenanceStatus,
  PrismaClient,
  SourceKind,
} from '@prisma/client';
import { CLUSTER_POLICY_V1, ContentClusteringService } from '../src/content-clustering.service';

const prisma = new PrismaClient();

test('three sources cluster one event while changed date or number stays separate', async (context) => {
  const suffix = randomUUID().slice(0, 8);
  const sources = await Promise.all(
    [1, 2, 3, 4, 5].map((index) =>
      prisma.source.create({
        data: {
          name: `Cluster ${suffix} ${index}`,
          slug: `cluster-${suffix}-${index}`,
          kind: SourceKind.RSS,
          adapterKey: 'generic-rss-v2',
          defaultIntervalSec: 900,
          config: { selectionPolicy: index === 1 ? 'ALL_ITEMS' : 'MATCH_TOPIC_TERMS' },
        },
      }),
    ),
  );
  context.after(async () => {
    await prisma.contentCluster.deleteMany({
      where: { policyVersion: { in: [CLUSTER_POLICY_V1, 'entity-facts-title-v2'] } },
    });
    await prisma.canonicalContent.deleteMany({
      where: { sourceId: { in: sources.map((source) => source.id) } },
    });
    await prisma.source.deleteMany({ where: { id: { in: sources.map((source) => source.id) } } });
    await prisma.$disconnect();
  });
  const createContent = (index: number, number: string, publishedAt: string) =>
    prisma.canonicalContent.create({
      data: {
        sourceId: sources[index - 1]!.id,
        canonicalUrl: `https://cluster-${suffix}-${index}.test/article`,
        externalId: `cluster-${index}`,
        contentHash: `${index}`.repeat(64),
        originalTitle: `OpenAI launches GPT-5 with ${number} throughput gain`,
        originalContent: `OpenAI launched GPT-5 with a measured ${number} throughput gain for developers.`,
        sourceLanguage: 'en',
        publisher: `Publisher ${index}`,
        publishedAt: new Date(publishedAt),
        provenanceStatus: ContentProvenanceStatus.VERIFIED,
        topics: ['technology'],
        sourceTier: Math.min(3, index),
        authorityScore: 1 - index * 0.1,
        metadata: { fixture: suffix },
      },
    });
  const sameEvent = await Promise.all([
    createContent(1, '25%', '2026-08-14T07:00:00Z'),
    createContent(2, '25%', '2026-08-14T08:00:00Z'),
    createContent(3, '25%', '2026-08-14T09:00:00Z'),
  ]);
  const changedNumber = await createContent(4, '30%', '2026-08-14T09:00:00Z');
  const changedDate = await createContent(5, '25%', '2026-08-15T09:00:00Z');
  const service = new ContentClusteringService(prisma as never);
  const assignments = [];
  for (const content of [...sameEvent, changedNumber, changedDate])
    assignments.push(await service.assign(content.id));
  assert.equal(new Set(assignments.slice(0, 3).map((item) => item.clusterId)).size, 1);
  assert.notEqual(assignments[3]!.clusterId, assignments[0]!.clusterId);
  assert.notEqual(assignments[4]!.clusterId, assignments[0]!.clusterId);
  const shared = await prisma.contentCluster.findUniqueOrThrow({
    where: { id: assignments[0]!.clusterId },
    include: { members: true },
  });
  assert.equal(shared.members.length, 3);
  assert.equal(shared.primaryCanonicalContentId, sameEvent[0]!.id);
  await service.rebuild('entity-facts-title-v2');
  assert.equal(
    await prisma.contentCluster.count({
      where: { policyVersion: CLUSTER_POLICY_V1, status: ContentClusterStatus.ARCHIVED },
    }),
    3,
  );
  assert.ok(
    await prisma.contentCluster.count({
      where: { policyVersion: 'entity-facts-title-v2', status: ContentClusterStatus.ACTIVE },
    }),
  );
});
