import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDlqArgs } from '../src/dead-letter.service';

test('DLQ CLI parses bounded inspect/retry filters and explicit policy change', () => {
  assert.deepEqual(
    parseDlqArgs(['inspect', '--type=FETCH_SOURCE', '--error=HTTP_429', '--limit=25']).filter,
    { limit: 25, type: 'FETCH_SOURCE', errorCode: 'HTTP_429' },
  );
  const retry = parseDlqArgs(['retry', '--source=abc', '--max=5', '--policy-changed']);
  assert.equal(retry.action, 'retry');
  assert.equal(retry.max, 5);
  assert.equal(retry.policyChanged, true);
  assert.throws(() => parseDlqArgs(['retry', '--max=101']), /DLQ_LIMIT_INVALID/);
});
