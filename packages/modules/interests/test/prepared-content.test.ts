import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTopicInventory, catalogTopic } from '../src/prepared-content.service';

test('legacy topic keys map into the onboarding catalog deterministically', () => {
  assert.equal(catalogTopic('technology'), 'technology');
  assert.equal(catalogTopic('OpenAI'), 'technology');
  assert.equal(catalogTopic('apple'), 'technology');
  assert.equal(catalogTopic('bitcoin'), 'markets');
  assert.equal(catalogTopic('unknown'), null);
});

test('topic inventory exposes availability, freshness and publisher diversity', () => {
  const inventory = buildTopicInventory(
    [
      { topics: ['technology'], publisher: 'A', publishedAt: new Date('2026-08-15T00:00:00Z') },
      { topics: ['technology', 'markets'], publisher: 'B', publishedAt: new Date('2026-08-01T00:00:00Z') },
      { topics: ['unknown'], publisher: 'C', publishedAt: new Date('2026-08-15T00:00:00Z') },
    ],
    new Date('2026-08-16T00:00:00Z'),
  );
  assert.deepEqual(inventory.map((item) => item.key), ['technology', 'markets']);
  assert.deepEqual(inventory[0], {
    key: 'technology',
    availableItems: 2,
    freshItems: 1,
    latestPublishedAt: new Date('2026-08-15T00:00:00Z'),
    publishers: 2,
  });
});
