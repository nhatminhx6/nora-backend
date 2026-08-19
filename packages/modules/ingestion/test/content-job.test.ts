import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTENT_JOB_POLICIES,
  ContentJobData,
  assertContentJobData,
  contentJobId,
  retryDecision,
} from '../src/content-job';

const fetchJob = (scheduleBucket = '2026-08-14T06-30Z'): ContentJobData => ({
  version: 2,
  type: 'FETCH_SOURCE',
  correlationId: 'corr-1',
  pipelineRunId: 'run-1',
  sourceId: 'source-1',
  subscriptionId: 'subscription-1',
  scheduleBucket,
  attempt: 0,
});

test('same source subscription and bucket produces one deterministic BullMQ-safe identity', () => {
  const first = contentJobId(fetchJob());
  const second = contentJobId(fetchJob());
  assert.equal(first, second);
  assert.equal(first.includes(':'), false);
  assert.notEqual(first, contentJobId(fetchJob('2026-08-14T06-40Z')));
});

test('rejects old and malformed payload versions clearly', () => {
  assert.throws(
    () => assertContentJobData({ ...fetchJob(), version: 1 }),
    /JOB_VERSION_UNSUPPORTED/,
  );
  assert.throws(
    () => assertContentJobData({ ...fetchJob(), correlationId: '' }),
    /JOB_PAYLOAD_INVALID/,
  );
});

test('429 retry respects a longer delay than ordinary 500', () => {
  const rateLimited = retryDecision({ httpStatus: 429, retryAfterMs: 90_000 }, 1);
  const serverError = retryDecision({ httpStatus: 500 }, 1);
  assert.equal(rateLimited.retry, true);
  assert.equal(serverError.retry, true);
  assert.ok(rateLimited.delayMs > serverError.delayMs);
});

test('parser and validation rejects do not retry while every job has a timeout', () => {
  assert.equal(retryDecision({ code: 'PARSER_INVALID_PAYLOAD' }, 1).retry, false);
  assert.equal(retryDecision({ code: 'VALIDATION_REJECTED' }, 1).retry, false);
  assert.ok(Object.values(CONTENT_JOB_POLICIES).every((policy) => policy.timeoutMs > 0));
});
