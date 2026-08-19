import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  ContentProvenanceStatus,
  EntityType,
  InterestStatus,
  PrismaClient,
  SourceKind,
} from '@prisma/client';
import { CandidateMatchingService, MATCHING_POLICY_V1 } from '../src/candidate-matching.service';

const prisma = new PrismaClient();

test('matching canonical content is idempotent and stores structured reasons', async (context) => {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `match-${suffix}@test.local`,
      displayName: 'Match User',
      locale: 'vi',
      homeMarket: 'VN',
      followedMarkets: ['GLOBAL'],
    },
  });
  const interest = await prisma.interest.create({
    data: {
      userId: user.id,
      topicKey: 'technology',
      name: 'Technology',
      normalizedName: `technology-${suffix}`,
      type: EntityType.TOPIC,
      status: InterestStatus.ACTIVE,
    },
  });
  const source = await prisma.source.create({
    data: {
      name: `Match ${suffix}`,
      slug: `match-${suffix}`,
      kind: SourceKind.RSS,
      adapterKey: 'generic-rss-v2',
      defaultIntervalSec: 900,
    },
  });
  const content = await prisma.canonicalContent.create({
    data: {
      sourceId: source.id,
      canonicalUrl: `https://match-${suffix}.test/article`,
      externalId: 'match-article',
      contentHash: 'a'.repeat(64),
      originalTitle: 'OpenAI launches GPT-5',
      originalContent: 'OpenAI launches GPT-5 globally.',
      sourceLanguage: 'en',
      publisher: 'OpenAI',
      publishedAt: new Date(),
      provenanceStatus: ContentProvenanceStatus.VERIFIED,
      topics: ['technology'],
      markets: ['GLOBAL'],
      sourceTier: 1,
      authorityScore: 0.9,
      claims: {
        create: {
          claimHash: 'b'.repeat(64),
          claimType: 'FACTUAL_STATEMENT',
          text: 'OpenAI launches GPT-5 globally.',
          entities: ['OpenAI', 'GPT-5'],
          extractionVersion: 'fixture-v1',
        },
      },
    },
  });
  context.after(async () => {
    await prisma.contentAudienceMatch.deleteMany({ where: { userId: user.id } });
    await prisma.canonicalContent.delete({ where: { id: content.id } });
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.interest.delete({ where: { id: interest.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });
  const service = new CandidateMatchingService(prisma as never);
  assert.deepEqual(await service.matchCanonicalContent(content.id), { matched: 1, skipped: 0 });
  assert.deepEqual(await service.matchCanonicalContent(content.id), { matched: 1, skipped: 0 });
  const matches = await prisma.contentAudienceMatch.findMany({
    where: { userId: user.id, policyVersion: MATCHING_POLICY_V1 },
  });
  assert.equal(matches.length, 1);
  assert.deepEqual((matches[0]!.matchedReason as { topicKeys: string[] }).topicKeys, [
    'technology',
  ]);
});
