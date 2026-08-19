import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSemanticText, semanticContentHash } from '../src/canonical-content.service';

test('semantic normalization stabilizes unicode, whitespace and line endings', () => {
  assert.equal(normalizeSemanticText('  Cafe\u0301\r\n  tăng\t2%  '), 'Café\ntăng 2%');
  assert.equal(
    semanticContentHash('  Market update ', 'Value  2%\r\nToday'),
    semanticContentHash('Market update', 'Value 2%\nToday'),
  );
});

test('semantic hash changes when meaningful numbers or content change', () => {
  assert.notEqual(
    semanticContentHash('Market update', 'Value increased 2%'),
    semanticContentHash('Market update', 'Value increased 3%'),
  );
});
