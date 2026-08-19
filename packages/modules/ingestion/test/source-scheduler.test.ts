import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentJobId } from '../src/content-job';
import {
  isPipelineFlagEnabled,
  nextSourceSyncAt,
  scheduleBucket,
} from '../src/source-scheduler.service';

test('two schedulers derive one logical fetch identity for the same subscription bucket', () => {
  const base = {
    version: 2 as const,
    type: 'FETCH_SOURCE' as const,
    correlationId: 'run-a',
    pipelineRunId: 'pipeline-a',
    sourceId: 'source-1',
    subscriptionId: 'subscription-1',
    scheduleBucket: scheduleBucket(new Date('2026-08-14T08:03:00Z')),
    attempt: 0,
  };
  assert.equal(
    contentJobId(base),
    contentJobId({ ...base, correlationId: 'run-b', pipelineRunId: 'pipeline-b' }),
  );
});

test('next sync applies stable jitter below five percent', () => {
  const now = new Date('2026-08-14T08:00:00Z');
  const first = nextSourceSyncAt(now, 900, 'subscription-1');
  assert.equal(first.toISOString(), nextSourceSyncAt(now, 900, 'subscription-1').toISOString());
  assert.ok(first.getTime() >= now.getTime() + 900_000);
  assert.ok(first.getTime() < now.getTime() + 945_000);
});

test('feature flag parser supports safe runtime defaults', () => {
  assert.equal(isPipelineFlagEnabled(undefined, true), true);
  assert.equal(isPipelineFlagEnabled(undefined, false), false);
  assert.equal(isPipelineFlagEnabled('false', true), false);
  assert.equal(isPipelineFlagEnabled('TRUE', false), true);
});
