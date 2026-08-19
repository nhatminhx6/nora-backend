import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { diversifiedRanking, rankingScore } from '../src/content-ranking.service';

test('ranking exposes versioned component breakdown and global importance remains competitive', () => {
  const result = rankingScore({
    relevanceScore: 0,
    entityMatches: 0,
    authority: 1,
    importance: 1,
    publishedAt: new Date('2026-08-14T00:00:00Z'),
    now: new Date('2026-08-14T01:00:00Z'),
    markets: ['GLOBAL'],
    homeMarket: 'VN',
    followedMarkets: [],
    duplicate: false,
    alreadySeen: false,
  });
  assert.equal(result.version, 'content-ranking-v1');
  assert.ok(result.score > 0.4);
  assert.equal(result.components.importance, 1);
});

test('duplicate, stale and already-seen penalties lower score', () => {
  const base = {
    relevanceScore: 1,
    entityMatches: 1,
    authority: 1,
    importance: 0.5,
    publishedAt: new Date('2026-08-14T00:00:00Z'),
    now: new Date('2026-08-14T01:00:00Z'),
    markets: ['VN'],
    homeMarket: 'VN',
    followedMarkets: ['GLOBAL'],
  };
  const fresh = rankingScore({ ...base, duplicate: false, alreadySeen: false });
  const penalized = rankingScore({
    ...base,
    publishedAt: new Date('2026-08-01T00:00:00Z'),
    duplicate: true,
    alreadySeen: true,
  });
  assert.ok(fresh.score > penalized.score);
});

test('diversity caps publishers and topics with deterministic id tiebreaker', () => {
  const items = [
    { id: 'b', score: 1, publisher: 'A', topic: 'tech' },
    { id: 'a', score: 1, publisher: 'A', topic: 'tech' },
    { id: 'c', score: 0.9, publisher: 'A', topic: 'tech' },
    { id: 'd', score: 0.8, publisher: 'B', topic: 'tech' },
    { id: 'e', score: 0.7, publisher: 'C', topic: 'health' },
  ];
  assert.deepEqual(
    diversifiedRanking(items, 5).map((item) => item.id),
    ['a', 'b', 'd', 'e'],
  );
});
