import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentRetentionPolicy, SourceKind } from '@prisma/client';
import {
  SOURCE_PROFILES,
  sourceProfile,
  sourceProfileBySlug,
  sourceProfilesForTopic,
} from '../src/source-registry';

test('registry has unique fixed source identities and complete policy fields', () => {
  assert.equal(
    new Set(SOURCE_PROFILES.map((profile) => profile.slug)).size,
    SOURCE_PROFILES.length,
  );

  for (const profile of SOURCE_PROFILES) {
    assert.equal(profile.kind, SourceKind.RSS);
    assert.ok(profile.feedUrl.startsWith('https://'));
    assert.ok(profile.language === 'vi' || profile.language === 'en');
    assert.ok(profile.markets.length > 0);
    assert.ok(profile.topics.length > 0);
    assert.ok(profile.sourceTier >= 1 && profile.sourceTier <= 3);
    assert.ok(profile.authorityScore >= 0 && profile.authorityScore <= 1);
    assert.equal(profile.licensePolicy, ContentRetentionPolicy.EXCERPT_ONLY);
    assert.ok(profile.updateIntervalSec > 0);
    assert.ok(profile.verificationPolicy.length > 0);
    assert.equal(profile.enabled, true);
  }
});

test('topic mapping reuses fixed profiles and never interpolates user input into a slug', () => {
  assert.equal(sourceProfile('products').slug, 'vnexpress-technology-rss');
  assert.equal(sourceProfile('unknown-user-interest').slug, 'vnexpress-latest-rss');
  assert.equal(sourceProfile('another-user-interest').slug, 'vnexpress-latest-rss');
  assert.equal(sourceProfileBySlug('unknown-user-interest'), null);
});

test('registry separates source language from market and contains no credentials', () => {
  const globalEnglish = sourceProfile('openai');
  assert.equal(globalEnglish.language, 'en');
  assert.deepEqual(globalEnglish.markets, ['GLOBAL', 'US']);
  assert.equal('locale' in globalEnglish, false);
  assert.equal('credential' in globalEnglish, false);
  assert.equal('credentialsRef' in globalEnglish, false);
});

test('topic discovery returns all enabled shared profiles', () => {
  const technologyProfiles = sourceProfilesForTopic('technology');
  assert.ok(technologyProfiles.length >= 3);
  assert.ok(technologyProfiles.every((profile) => profile.topics.includes('technology')));
});
