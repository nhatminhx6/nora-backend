import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { SourceFetchError } from '../src/raw-source-payload.service';
import {
  sanitizeLogMetadata,
  stableContentErrorCode,
} from '../src/content-pipeline-telemetry.service';

test('structured metadata recursively redacts secrets', () => {
  assert.deepEqual(
    sanitizeLogMetadata({
      correlationId: 'correlation-1',
      authorization: 'Bearer private',
      nested: { apiKey: 'private', safe: 'visible' },
      cookies: ['private'],
    }),
    {
      correlationId: 'correlation-1',
      authorization: '[REDACTED]',
      nested: { apiKey: '[REDACTED]', safe: 'visible' },
      cookies: '[REDACTED]',
    },
  );
});

test('business error codes are stable and raw messages are not persisted', () => {
  assert.equal(stableContentErrorCode(new SourceFetchError('HTTP_429', 429, 60_000)), 'HTTP_429');
  assert.equal(stableContentErrorCode(new Error('VALIDATION_REJECTED')), 'VALIDATION_REJECTED');
  assert.equal(
    stableContentErrorCode(new Error('getaddrinfo failed for private.internal.example')),
    'CONTENT_JOB_FAILED',
  );
});
