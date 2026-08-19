import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { clusterFeatures, primaryContentScore } from '../src/content-clustering.service';

test('cluster features preserve entities, protected values and event day', () => {
  const features = clusterFeatures({
    originalTitle: 'OpenAI launches GPT-5 with 25% gain',
    originalContent: 'The launch happened on 2026-08-14 with USD 2 million.',
    topics: ['technology'],
    publishedAt: new Date('2026-08-14T07:00:00Z'),
  });
  assert.ok(features.entities.includes('OpenAI'));
  assert.ok(features.protectedValues.includes('25%'));
  assert.ok(features.protectedValues.includes('2026-08-14T00:00:00.000Z'));
  assert.equal(features.eventDay, '2026-08-14');
});

test('primary scoring prefers authoritative direct complete content', () => {
  const now = new Date('2026-08-14T08:00:00Z');
  const base = {
    publishedAt: new Date('2026-08-14T07:00:00Z'),
    provenanceStatus: 'VERIFIED' as const,
  };
  const direct = primaryContentScore(
    { ...base, sourceTier: 1, authorityScore: 1 as never, originalContent: 'x'.repeat(1500) },
    { selectionPolicy: 'ALL_ITEMS' },
    now,
  );
  const weak = primaryContentScore(
    { ...base, sourceTier: 3, authorityScore: 0.4 as never, originalContent: 'short' },
    { selectionPolicy: 'MATCH_TOPIC_TERMS' },
    now,
  );
  assert.ok(direct > weak);
});
