import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentAlerts } from '../src/content-metrics.service';

test('metrics contract raises required stale, coverage, queue, 429 and quality alerts', () => {
  const alerts = contentAlerts({
    source: { staleTier1: 1, errors: { HTTP_429: 3 }, requestCount: 10 },
    localization: { viCoverage: 0.5, qualityFailures: { NUMBER_CHANGED: 4 }, verified: 4 },
    queue: { oldestWaitingAgeMs: 400_000 },
  });
  assert.deepEqual(
    alerts.map((alert) => alert.code),
    [
      'TIER1_SOURCE_STALE',
      'VI_COVERAGE_LOW',
      'QUEUE_AGE_HIGH',
      'HTTP_429_SPIKE',
      'QUALITY_REJECTION_SPIKE',
    ],
  );
});
