import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deterministicEntries,
  normalizeTerminologyTerm,
} from '../src/terminology-glossary.service';
import { TERMINOLOGY_SEED_V1 } from '../src/terminology-seed';

test('seed covers all required domains with protected organization/product terms', () => {
  const domains = new Set(TERMINOLOGY_SEED_V1.map((entry) => entry.domain));
  assert.deepEqual([...domains].sort(), [
    'economy-finance',
    'general-news',
    'health-safety',
    'organization-product',
    'technology',
  ]);
  assert.ok(TERMINOLOGY_SEED_V1.some((entry) => entry.sourceTerm === 'OpenAI' && entry.protected));
  assert.ok(TERMINOLOGY_SEED_V1.every((entry) => entry.version === 'glossary-v1'));
});

test('normalization and conflict resolution are deterministic regardless of input order', () => {
  const conflicts = [
    {
      sourceLanguage: 'en',
      targetLocale: 'vi',
      sourceTerm: ' Interest   Rate ',
      preferredTerm: 'lãi vay',
      protected: false,
      domain: 'economy-finance',
      version: 'v1',
    },
    {
      sourceLanguage: 'en',
      targetLocale: 'vi',
      sourceTerm: 'interest rate',
      preferredTerm: 'lãi suất',
      protected: true,
      domain: 'economy-finance',
      version: 'v1',
    },
  ];
  assert.equal(normalizeTerminologyTerm(' Interest   Rate '), 'interest rate');
  assert.deepEqual(deterministicEntries(conflicts), deterministicEntries([...conflicts].reverse()));
  assert.equal(deterministicEntries(conflicts).entries[0]?.preferredTerm, 'lãi suất');
  assert.equal(deterministicEntries(conflicts).conflicts, 1);
});
