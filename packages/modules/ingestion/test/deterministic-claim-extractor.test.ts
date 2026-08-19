import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicClaimExtractorService } from '../src/deterministic-claim-extractor.service';

const extractor = new DeterministicClaimExtractorService();

test('extracts Vietnamese protected facts, direction, attribution and certainty deterministically', () => {
  const text =
    'Theo Ngân hàng Nhà nước Việt Nam, lãi suất có thể giảm 0,5% vào 14/08/2026, còn gói hỗ trợ đạt 2 tỷ đồng.';
  const first = extractor.extract(text);
  const second = extractor.extract(text);
  assert.deepEqual(second, first);
  const claim = first.claims[0]!;
  assert.ok(claim.entities.includes('Ngân hàng Nhà nước Việt Nam'));
  assert.ok(claim.facts.some((fact) => fact.kind === 'PERCENTAGE' && fact.raw === '0,5%'));
  assert.ok(claim.facts.some((fact) => fact.kind === 'DATE_TIME' && fact.raw === '14/08/2026'));
  assert.ok(claim.facts.some((fact) => fact.kind === 'CURRENCY' && fact.raw === '2 tỷ đồng'));
  assert.deepEqual(claim.directions, ['giảm']);
  assert.equal(claim.attribution, 'Ngân hàng Nhà nước Việt Nam');
  assert.equal(claim.certainty, 'có thể');
  for (const fact of claim.facts) assert.equal(text.slice(fact.start, fact.end), fact.raw);
});

test('extracts English product versions, currency, percentage and attribution', () => {
  const text =
    'According to OpenAI, GPT-5 may increase throughput by 25% while API spending remains unchanged at USD 2.5 million on 2026-08-14.';
  const extraction = extractor.extract(text);
  const claim = extraction.claims[0]!;
  assert.ok(claim.entities.includes('OpenAI'));
  assert.ok(claim.facts.some((fact) => fact.kind === 'PRODUCT_VERSION' && fact.raw === 'GPT-5'));
  assert.ok(claim.facts.some((fact) => fact.kind === 'PERCENTAGE' && fact.raw === '25%'));
  assert.ok(claim.facts.some((fact) => fact.kind === 'CURRENCY' && fact.raw === 'USD 2.5 million'));
  assert.ok(claim.facts.some((fact) => fact.kind === 'DATE_TIME'));
  assert.deepEqual(claim.directions, ['increase', 'unchanged']);
  assert.equal(claim.attribution, 'OpenAI');
  assert.equal(claim.certainty, 'may');
  assert.ok(extraction.preservationConstraints.includes('GPT-5'));
  assert.ok(extraction.preservationConstraints.includes('USD 2.5 million'));
});

test('does not double-count numbers inside dates, currency, percentages or versions', () => {
  const facts = extractor.extract('GPT-5 rose 2.5% on 2026-08-14 with USD 3 million.').claims[0]!
    .facts;
  assert.equal(facts.filter((fact) => fact.kind === 'NUMBER').length, 0);
});
