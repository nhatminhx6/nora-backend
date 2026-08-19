import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { FeedV2Service } from '../src/feed-v2.service';

test('feed v2 rejects unsupported locale and invalid limit', async () => {
  const service = new FeedV2Service({} as never);
  await assert.rejects(() => service.getFeed('user', 'zh-Hans'), BadRequestException);
  await assert.rejects(() => service.getFeed('user', 'vi', undefined, '0'), BadRequestException);
});

test('feed v2 returns verified localization metadata and terminates cursor pagination', async () => {
  const matches = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ].map((id, index) => ({
    id,
    canonicalContentId: `10000000-0000-4000-8000-00000000000${index + 1}`,
    clusterId: null,
    rankingScore: 1 - index * 0.1,
    matchedReason: { topicKeys: ['technology'] },
    canonicalContent: {
      publisher: index ? 'Publisher B' : 'Publisher A',
      topics: ['technology'],
      markets: ['GLOBAL', 'US'],
      sourceLanguage: 'en',
      canonicalUrl: `https://source.test/${index}`,
      publishedAt: new Date('2026-08-14T00:00:00Z'),
      metadata: { importanceScore: 0.9 },
      localizations: [
        {
          title: `Tin ${index}`,
          summary: `Tóm tắt ${index}`,
          status: 'VERIFIED',
          qualityScore: 0.96,
          verifiedAt: new Date('2026-08-14T01:00:00Z'),
          generatedAt: new Date('2026-08-14T00:30:00Z'),
        },
      ],
      clusterMemberships: [],
    },
  }));
  const service = new FeedV2Service({
    user: { findUniqueOrThrow: async () => ({ profileData: { contentFeedVersion: 'v2' } }) },
    contentAudienceMatch: { findMany: async () => matches },
  } as never);
  const first = await service.getFeed('user', 'vi', undefined, '1');
  assert.equal(first.items.length, 1);
  assert.equal(first.pagination.hasNextPage, true);
  assert.ok(first.pagination.nextCursor);
  assert.deepEqual(first.items[0]!.localization.markets, ['GLOBAL', 'US']);
  assert.equal(first.items[0]!.localization.sourceLanguage, 'en');
  assert.equal(first.items[0]!.localization.qualityStatus, 'VERIFIED');
  const second = await service.getFeed('user', 'vi', first.pagination.nextCursor!, '1');
  assert.equal(second.items.length, 1);
  assert.equal(second.pagination.hasNextPage, false);
  assert.equal(second.pagination.nextCursor, null);
});
