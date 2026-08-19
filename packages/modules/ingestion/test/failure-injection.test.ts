import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentJobId, retryDecision } from '../src/content-job';
import { parseLocalizationV3Output } from '../src/localization-v3.contract';
import { LocalizationQualityV3Validator } from '../src/localization-quality-v3.validator';
import { fetchSourceEnvelope, SourceFetchError } from '../src/raw-source-payload.service';
import { RssSourceV2Adapter } from '../src/rss-source-v2.adapter';

test('worker restart and duplicate delivery keep the same logical job identity', () => {
  const job = {
    version: 2 as const,
    type: 'NORMALIZE_PAYLOAD' as const,
    correlationId: 'correlation',
    pipelineRunId: 'run',
    sourceId: 'source',
    rawPayloadId: 'payload',
    attempt: 0,
  };
  assert.equal(
    contentJobId(job),
    contentJobId({ ...job, attempt: 4, correlationId: 'after-restart' }),
  );
});

test('403, 429 and timeout/network failures have controlled retry behavior', async () => {
  await assert.rejects(
    () =>
      fetchSourceEnvelope(
        'https://source.test',
        async () => new Response('', { status: 403 }) as never,
      ),
    (error: unknown) => error instanceof SourceFetchError && error.code === 'HTTP_403',
  );
  assert.ok(retryDecision({ httpStatus: 429, retryAfterMs: 90_000 }, 1).delayMs >= 90_000);
  assert.equal(retryDecision({ code: 'VALIDATION_REJECTED' }, 1).retry, false);
});

test('malformed RSS/Atom yields no candidate and redirect loop is a controlled network failure', async () => {
  const adapter = new RssSourceV2Adapter();
  const rows = await adapter.normalize({
    sourceId: 'source',
    rawPayloadId: 'raw',
    requestUrl: 'https://source.test/rss',
    finalUrl: 'https://source.test/rss',
    httpStatus: 200,
    contentType: 'application/rss+xml',
    fetchedAt: new Date(),
    body: new TextEncoder().encode('<rss><broken>'),
    payloadHash: 'a'.repeat(64),
    sourceLanguage: 'en',
    topicHints: [],
    marketHints: [],
  });
  assert.deepEqual(rows, []);
  await assert.rejects(
    () =>
      fetchSourceEnvelope('https://source.test', async () => {
        throw new TypeError('redirect loop');
      }),
    /NETWORK_ERROR/,
  );
});

test('invalid JSON-equivalent schema and changed number/entity/direction are blocked', () => {
  const context = {
    sourceTitle: 'OpenAI update',
    sourceContent: 'OpenAI said GPT-5 may increase by 25%.',
    preservedValues: ['25%', 'may', 'increase'],
    preservedTerms: ['OpenAI', 'GPT-5'],
    sourceLanguage: 'en' as const,
    targetLocale: 'vi' as const,
  };
  assert.throws(
    () => parseLocalizationV3Output('not-json', context),
    /LOCALIZATION_SCHEMA_INVALID/,
  );
  const quality = new LocalizationQualityV3Validator().validate({
    sourceTitle: context.sourceTitle,
    sourceContent: context.sourceContent,
    localizedTitle: 'Google update',
    localizedSummary: 'Google xác nhận GPT-6 giảm 30%.',
    localizedClaims: [
      { text: 'Google xác nhận GPT-6 giảm 30%.', evidence: [context.sourceContent] },
    ],
    sourceLanguage: 'en',
    targetLocale: 'vi',
    glossary: [],
  });
  assert.ok(quality.failureCodes.includes('NUMBER_CHANGED'));
  assert.ok(quality.failureCodes.includes('ENTITY_CORRUPTED'));
  assert.ok(quality.failureCodes.includes('DIRECTION_REVERSED'));
});
