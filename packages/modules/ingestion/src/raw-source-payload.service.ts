import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ContentRetentionPolicy, Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';
import { ContentJobData } from './content-job';
import { IngestionQueue } from './ingestion.queue';
import { SourceHealthService } from './source-health.service';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const EXCERPT_BYTES = 128 * 1024;
const SAFE_RESPONSE_HEADERS = new Set(['content-type', 'etag', 'last-modified', 'retry-after']);

export interface SourceFetchEnvelope {
  requestUrl: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  payloadHash: string;
  truncated: boolean;
  receivedBytes: number;
}

export class SourceFetchError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus?: number,
    readonly retryAfterMs?: number,
  ) {
    super(code);
  }
}

@Injectable()
export class RawSourcePayloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: IngestionQueue,
    private readonly health?: SourceHealthService,
  ) {}

  async fetchAndPersist(job: Extract<ContentJobData, { type: 'FETCH_SOURCE' }>) {
    const subscription = await this.prisma.sourceSubscription.findFirstOrThrow({
      where: { id: job.subscriptionId, sourceId: job.sourceId },
      include: { source: true },
    });
    const config = asRecord(subscription.config);
    const requestUrl = stringValue(config.feedUrl) ?? subscription.source.baseUrl;
    if (!requestUrl) throw new SourceFetchError('SOURCE_URL_MISSING');

    try {
      const envelope = await fetchSourceEnvelope(requestUrl);
      const payloadHash = envelope.payloadHash;
      const retentionPolicy = retentionFromConfig(subscription.source.config);
      const storedBody = retainedPayload(envelope.body, retentionPolicy);
      const expiresAt = retentionExpiry(retentionPolicy, new Date());
      const payload = await this.prisma.rawSourcePayload.upsert({
        where: { sourceId_payloadHash: { sourceId: job.sourceId, payloadHash } },
        update: { fetchedAt: new Date(), httpStatus: envelope.status },
        create: {
          sourceId: job.sourceId,
          subscriptionId: job.subscriptionId,
          requestUrl: envelope.requestUrl,
          finalUrl: envelope.finalUrl,
          httpStatus: envelope.status,
          contentType: envelope.headers['content-type'],
          payload: storedBody ? Buffer.from(storedBody) : null,
          payloadRef: envelope.truncated ? `excerpt:sha256:${payloadHash}` : null,
          payloadHash,
          fetchedAt: new Date(),
          retentionPolicy,
          expiresAt,
          metadata: {
            headers: envelope.headers,
            receivedBytes: envelope.receivedBytes,
            storedBytes: storedBody?.byteLength ?? 0,
            truncated: envelope.truncated,
          },
        },
        select: { id: true },
      });
      if (this.health) await this.health.recordSuccess(subscription.id);
      else
        await this.prisma.sourceSubscription.update({
          where: { id: subscription.id },
          data: {
            leaseOwner: null,
            leaseExpiresAt: null,
            lastSyncAt: new Date(),
            lastSuccessAt: new Date(),
            consecutiveFailures: 0,
            lastErrorCode: null,
          },
        });
      const queued = await this.queue.enqueueContentJob({
        version: 2,
        type: 'NORMALIZE_PAYLOAD',
        correlationId: job.correlationId,
        pipelineRunId: job.pipelineRunId,
        sourceId: job.sourceId,
        rawPayloadId: payload.id,
        attempt: 0,
      });
      return { rawPayloadId: payload.id, normalizeJobId: queued.jobId };
    } catch (error) {
      const code = error instanceof SourceFetchError ? error.code : 'NETWORK_ERROR';
      if (this.health) await this.health.recordFailure(subscription.id, code);
      else
        await this.prisma.sourceSubscription.update({
          where: { id: subscription.id },
          data: {
            leaseOwner: null,
            leaseExpiresAt: null,
            lastSyncAt: new Date(),
            consecutiveFailures: { increment: 1 },
            lastErrorCode: code,
          },
        });
      throw error;
    }
  }
}

export async function fetchSourceEnvelope(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceFetchEnvelope> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      headers: {
        Accept: 'application/rss+xml, application/xml;q=0.9',
        'User-Agent': 'NoraBot/0.2',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new SourceFetchError(
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'FETCH_TIMEOUT'
        : 'NETWORK_ERROR',
    );
  }
  const headers = safeResponseHeaders(response.headers);
  if (!response.ok) {
    throw new SourceFetchError(
      `HTTP_${response.status}`,
      response.status,
      response.status === 429 ? parseRetryAfter(headers['retry-after']) : undefined,
    );
  }
  const contentType = headers['content-type']?.toLocaleLowerCase('en-US') ?? '';
  if (!contentType.includes('xml') && !contentType.includes('rss') && !contentType.includes('atom'))
    throw new SourceFetchError('CONTENT_TYPE_UNSUPPORTED');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new SourceFetchError('PAYLOAD_EMPTY');
  return {
    requestUrl: url,
    finalUrl: response.url || url,
    status: response.status,
    headers,
    body: bytes.slice(0, MAX_PAYLOAD_BYTES > bytes.byteLength ? bytes.byteLength : EXCERPT_BYTES),
    payloadHash: sha256(bytes),
    truncated: bytes.byteLength > MAX_PAYLOAD_BYTES,
    receivedBytes: bytes.byteLength,
  };
}

export function safeResponseHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].filter(([name]) =>
      SAFE_RESPONSE_HEADERS.has(name.toLocaleLowerCase('en-US')),
    ),
  );
}

function retainedPayload(body: Uint8Array, policy: ContentRetentionPolicy): Uint8Array | null {
  if (policy === ContentRetentionPolicy.METADATA_ONLY) return null;
  return policy === ContentRetentionPolicy.EXCERPT_ONLY ? body.slice(0, EXCERPT_BYTES) : body;
}

function retentionFromConfig(value: Prisma.JsonValue): ContentRetentionPolicy {
  const policy = stringValue(asRecord(value).licensePolicy);
  return Object.values(ContentRetentionPolicy).includes(policy as ContentRetentionPolicy)
    ? (policy as ContentRetentionPolicy)
    : ContentRetentionPolicy.METADATA_ONLY;
}

function retentionExpiry(policy: ContentRetentionPolicy, now: Date): Date | null {
  if (policy === ContentRetentionPolicy.FULL_TEXT) return null;
  const days = policy === ContentRetentionPolicy.EXCERPT_ONLY ? 30 : 7;
  return new Date(now.getTime() + days * 86_400_000);
}

function parseRetryAfter(value?: string): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - Date.now());
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
