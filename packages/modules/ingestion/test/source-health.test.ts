import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMetrics, sourceIsStale } from '../src/source-health.service';

test('health metrics tolerate malformed persisted JSON and retain error distribution', () => {
  assert.deepEqual(
    parseMetrics({
      attempts: 7.9,
      successes: 2,
      parserAttempts: 10,
      parserRejected: 4,
      errors: { HTTP_403: 3, invalid: -1, text: 'bad' },
    }),
    {
      attempts: 7,
      successes: 2,
      parserAttempts: 10,
      parserRejected: 4,
      errors: { HTTP_403: 3 },
    },
  );
});

test('staleness is three source intervals with a sixty-second floor', () => {
  const now = new Date('2026-08-14T08:00:00Z');
  assert.equal(sourceIsStale(null, 900, now), true);
  assert.equal(sourceIsStale(new Date('2026-08-14T07:20:00Z'), 900, now), false);
  assert.equal(sourceIsStale(new Date('2026-08-14T07:14:59Z'), 900, now), true);
});
