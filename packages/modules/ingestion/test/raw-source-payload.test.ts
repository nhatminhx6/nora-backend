import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SourceFetchError,
  fetchSourceEnvelope,
  safeResponseHeaders,
} from '../src/raw-source-payload.service';

test('fetch envelope keeps provenance and strips sensitive headers', async () => {
  const result = await fetchSourceEnvelope(
    'https://feed.test/rss',
    async () =>
      new Response('<rss/>', {
        status: 200,
        headers: {
          'content-type': 'application/rss+xml',
          etag: 'v1',
          authorization: 'secret',
          'set-cookie': 'secret',
        },
      }),
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.etag, 'v1');
  assert.equal(result.headers.authorization, undefined);
  assert.equal(result.headers['set-cookie'], undefined);
});

test('429 exposes retry-after without response body or credentials', async () => {
  await assert.rejects(
    fetchSourceEnvelope(
      'https://feed.test/rss',
      async () => new Response('rate limited', { status: 429, headers: { 'retry-after': '90' } }),
    ),
    (error: unknown) =>
      error instanceof SourceFetchError &&
      error.code === 'HTTP_429' &&
      error.retryAfterMs === 90_000,
  );
});

test('classifies forbidden, timeout and network failures', async () => {
  await assert.rejects(
    fetchSourceEnvelope('https://feed.test/rss', async () => new Response('', { status: 403 })),
    (error: unknown) => error instanceof SourceFetchError && error.code === 'HTTP_403',
  );
  await assert.rejects(
    fetchSourceEnvelope('https://feed.test/rss', async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }),
    (error: unknown) => error instanceof SourceFetchError && error.code === 'FETCH_TIMEOUT',
  );
  await assert.rejects(
    fetchSourceEnvelope('https://feed.test/rss', async () => {
      throw new TypeError('getaddrinfo ENOTFOUND');
    }),
    (error: unknown) => error instanceof SourceFetchError && error.code === 'NETWORK_ERROR',
  );
});

test('rejects empty and invalid content types', async () => {
  await assert.rejects(
    fetchSourceEnvelope(
      'https://feed.test/rss',
      async () => new Response('', { status: 200, headers: { 'content-type': 'application/xml' } }),
    ),
    /PAYLOAD_EMPTY/,
  );
  await assert.rejects(
    fetchSourceEnvelope(
      'https://feed.test/rss',
      async () =>
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    ),
    /CONTENT_TYPE_UNSUPPORTED/,
  );
});

test('oversized payload becomes a controlled excerpt', async () => {
  const result = await fetchSourceEnvelope(
    'https://feed.test/rss',
    async () =>
      new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      }),
  );
  assert.equal(result.truncated, true);
  assert.equal(result.body.byteLength, 128 * 1024);
  assert.equal(result.payloadHash.length, 64);
});

test('header allowlist excludes credentials', () => {
  assert.deepEqual(safeResponseHeaders(new Headers({ etag: 'x', cookie: 'secret' })), {
    etag: 'x',
  });
});
