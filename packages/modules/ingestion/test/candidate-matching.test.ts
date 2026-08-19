import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidateReasons, isCandidate } from '../src/candidate-matching.service';

const base = {
  contentTopics: ['technology'],
  contentEntities: ['OpenAI'],
  contentMarkets: ['GLOBAL', 'US'],
  text: 'OpenAI launches GPT-5',
  interestTopics: ['technology'],
  interestEntities: ['OpenAI'],
  watchKeywords: ['GPT-5'],
  homeMarket: 'VN',
  followedMarkets: ['GLOBAL'],
  importance: 0.5,
};

test('matches topic, entity, keyword and followed market with machine-readable reasons', () => {
  const reason = candidateReasons(base);
  assert.deepEqual(reason.topicKeys, ['technology']);
  assert.deepEqual(reason.entities, ['OpenAI']);
  assert.deepEqual(reason.keywords, ['GPT-5']);
  assert.deepEqual(reason.markets, ['GLOBAL']);
  assert.equal(isCandidate(reason), true);
});

test('global importance bypasses market mismatch but unrelated ordinary content is skipped', () => {
  const unrelated = candidateReasons({
    ...base,
    contentTopics: ['health'],
    contentEntities: [],
    contentMarkets: ['US'],
    text: 'Other story',
    interestTopics: [],
    interestEntities: [],
    watchKeywords: [],
    followedMarkets: [],
    importance: 0.2,
  });
  assert.equal(isCandidate(unrelated), false);
  assert.equal(
    isCandidate(
      candidateReasons({
        ...base,
        contentTopics: [],
        contentEntities: [],
        contentMarkets: [],
        text: '',
        interestTopics: [],
        interestEntities: [],
        watchKeywords: [],
        followedMarkets: [],
        importance: 0.9,
      }),
    ),
    true,
  );
});
