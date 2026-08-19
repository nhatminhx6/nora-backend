import { createHash } from 'node:crypto';
import { KnownLocale, isKnownLocale } from '@nora/common';
import { JobsOptions, MinimalJob } from 'bullmq';

export const CONTENT_JOB_VERSION = 2 as const;

export const CONTENT_JOB_TYPES = [
  'DISCOVER_DUE_SOURCES',
  'FETCH_SOURCE',
  'NORMALIZE_PAYLOAD',
  'VALIDATE_CONTENT',
  'CLUSTER_CONTENT',
  'LOCALIZE_CONTENT',
  'MATCH_USERS',
  'BUILD_BRIEFS',
  'BACKFILL_CONTENT',
  'REPLAY_PAYLOAD',
] as const;

export type ContentJobType = (typeof CONTENT_JOB_TYPES)[number];

interface ContentJobBase {
  version: typeof CONTENT_JOB_VERSION;
  type: ContentJobType;
  correlationId: string;
  pipelineRunId: string;
  sourceId?: string;
  attempt: number;
}

export type ContentJobData =
  | (ContentJobBase & { type: 'DISCOVER_DUE_SOURCES'; scheduleBucket: string })
  | (ContentJobBase & {
      type: 'FETCH_SOURCE';
      sourceId: string;
      subscriptionId: string;
      scheduleBucket: string;
    })
  | (ContentJobBase & { type: 'NORMALIZE_PAYLOAD'; sourceId: string; rawPayloadId: string })
  | (ContentJobBase & {
      type: 'VALIDATE_CONTENT';
      sourceId: string;
      canonicalContentId: string;
    })
  | (ContentJobBase & {
      type: 'CLUSTER_CONTENT';
      canonicalContentId: string;
      policyVersion: string;
    })
  | (ContentJobBase & {
      type: 'LOCALIZE_CONTENT';
      canonicalContentId: string;
      locale: KnownLocale;
      sourceContentHash: string;
      policyVersion: string;
      glossaryVersion: string;
    })
  | (ContentJobBase & {
      type: 'MATCH_USERS';
      canonicalContentId: string;
      policyVersion: string;
    })
  | (ContentJobBase & { type: 'BUILD_BRIEFS'; dateBucket: string; locale?: KnownLocale })
  | (ContentJobBase & { type: 'BACKFILL_CONTENT'; cursor?: string; batchSize: number })
  | (ContentJobBase & {
      type: 'REPLAY_PAYLOAD';
      sourceId: string;
      rawPayloadId: string;
      reason: string;
    });

export interface ContentJobPolicy {
  timeoutMs: number;
  attempts: number;
}

export const CONTENT_JOB_POLICIES: Readonly<Record<ContentJobType, ContentJobPolicy>> = {
  DISCOVER_DUE_SOURCES: { timeoutMs: 30_000, attempts: 2 },
  FETCH_SOURCE: { timeoutMs: 30_000, attempts: 5 },
  NORMALIZE_PAYLOAD: { timeoutMs: 20_000, attempts: 3 },
  VALIDATE_CONTENT: { timeoutMs: 30_000, attempts: 1 },
  CLUSTER_CONTENT: { timeoutMs: 45_000, attempts: 3 },
  LOCALIZE_CONTENT: { timeoutMs: 90_000, attempts: 6 },
  MATCH_USERS: { timeoutMs: 60_000, attempts: 3 },
  BUILD_BRIEFS: { timeoutMs: 120_000, attempts: 3 },
  BACKFILL_CONTENT: { timeoutMs: 300_000, attempts: 2 },
  REPLAY_PAYLOAD: { timeoutMs: 120_000, attempts: 3 },
};

export interface ContentJobFailure {
  code?: string;
  httpStatus?: number;
  retryAfterMs?: number;
}

export interface RetryDecision {
  retry: boolean;
  delayMs: number;
  errorCode: string;
}

const NON_RETRYABLE_CODES = new Set([
  'PARSER_INVALID_PAYLOAD',
  'VALIDATION_REJECTED',
  'PROVENANCE_REJECTED',
  'JOB_VERSION_UNSUPPORTED',
  'JOB_PAYLOAD_INVALID',
]);

export function retryDecision(error: ContentJobFailure, attemptsMade: number): RetryDecision {
  const code = error.code ?? (error.httpStatus ? `HTTP_${error.httpStatus}` : 'NETWORK_ERROR');
  if (NON_RETRYABLE_CODES.has(code)) return { retry: false, delayMs: 0, errorCode: code };

  const exponent = Math.max(0, attemptsMade - 1);
  if (error.httpStatus === 429 || code === 'HTTP_429') {
    return {
      retry: true,
      delayMs: Math.max(error.retryAfterMs ?? 0, Math.min(15 * 60_000, 60_000 * 2 ** exponent)),
      errorCode: 'HTTP_429',
    };
  }
  if (error.httpStatus !== undefined && error.httpStatus >= 500) {
    return {
      retry: true,
      delayMs: Math.min(2 * 60_000, 5_000 * 2 ** exponent),
      errorCode: code,
    };
  }
  return {
    retry: true,
    delayMs: Math.min(5 * 60_000, 10_000 * 2 ** exponent),
    errorCode: code,
  };
}

export function contentJobOptions(data: ContentJobData): JobsOptions {
  const policy = CONTENT_JOB_POLICIES[data.type];
  return {
    attempts: policy.attempts,
    backoff: { type: 'content-v2' },
    removeOnComplete: 500,
    removeOnFail: 2_000,
    jobId: contentJobId(data),
  };
}

export function contentJobId(data: ContentJobData): string {
  const identity = (() => {
    switch (data.type) {
      case 'DISCOVER_DUE_SOURCES':
        return data.scheduleBucket;
      case 'FETCH_SOURCE':
        return `${data.subscriptionId}-${data.scheduleBucket}`;
      case 'NORMALIZE_PAYLOAD':
        return data.rawPayloadId;
      case 'VALIDATE_CONTENT':
        return data.canonicalContentId;
      case 'CLUSTER_CONTENT':
        return `${data.canonicalContentId}-${data.policyVersion}`;
      case 'LOCALIZE_CONTENT':
        return `${data.canonicalContentId}-${data.locale}-${data.sourceContentHash}-${data.policyVersion}-${data.glossaryVersion}`;
      case 'MATCH_USERS':
        return `${data.canonicalContentId}-${data.policyVersion}`;
      case 'BUILD_BRIEFS':
        return `${data.dateBucket}-${data.locale ?? 'all'}`;
      case 'BACKFILL_CONTENT':
        return `${data.cursor ?? 'start'}-${data.batchSize}`;
      case 'REPLAY_PAYLOAD':
        return `${data.rawPayloadId}-${data.reason}`;
    }
  })();
  const identityHash = createHash('sha256').update(identity).digest('hex');
  return sanitizeJobId(`v${data.version}-${data.type.toLocaleLowerCase('en-US')}-${identityHash}`);
}

export function sanitizeJobId(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 240);
}

export function assertContentJobData(value: unknown): asserts value is ContentJobData {
  if (!isRecord(value) || value.version !== CONTENT_JOB_VERSION) {
    throw new Error('JOB_VERSION_UNSUPPORTED');
  }
  if (!CONTENT_JOB_TYPES.includes(value.type as ContentJobType))
    throw new Error('JOB_PAYLOAD_INVALID');
  for (const field of ['correlationId', 'pipelineRunId']) {
    if (typeof value[field] !== 'string' || value[field].length === 0)
      throw new Error('JOB_PAYLOAD_INVALID');
  }
  if (!Number.isInteger(value.attempt) || Number(value.attempt) < 0)
    throw new Error('JOB_PAYLOAD_INVALID');

  const requireStrings = (...fields: string[]) => {
    for (const field of fields) {
      if (typeof value[field] !== 'string' || value[field].length === 0)
        throw new Error('JOB_PAYLOAD_INVALID');
    }
  };
  switch (value.type as ContentJobType) {
    case 'DISCOVER_DUE_SOURCES':
      requireStrings('scheduleBucket');
      break;
    case 'FETCH_SOURCE':
      requireStrings('sourceId', 'subscriptionId', 'scheduleBucket');
      break;
    case 'NORMALIZE_PAYLOAD':
      requireStrings('sourceId', 'rawPayloadId');
      break;
    case 'VALIDATE_CONTENT':
      requireStrings('sourceId', 'canonicalContentId');
      break;
    case 'CLUSTER_CONTENT':
      requireStrings('canonicalContentId', 'policyVersion');
      break;
    case 'LOCALIZE_CONTENT':
      requireStrings('canonicalContentId', 'sourceContentHash', 'policyVersion', 'glossaryVersion');
      if (!isKnownLocale(value.locale)) throw new Error('JOB_PAYLOAD_INVALID');
      break;
    case 'MATCH_USERS':
      requireStrings('canonicalContentId', 'policyVersion');
      break;
    case 'BUILD_BRIEFS':
      requireStrings('dateBucket');
      if (value.locale !== undefined && !isKnownLocale(value.locale))
        throw new Error('JOB_PAYLOAD_INVALID');
      break;
    case 'BACKFILL_CONTENT':
      if (!Number.isInteger(value.batchSize) || Number(value.batchSize) <= 0)
        throw new Error('JOB_PAYLOAD_INVALID');
      break;
    case 'REPLAY_PAYLOAD':
      requireStrings('sourceId', 'rawPayloadId', 'reason');
      break;
  }
}

export function isContentJobData(value: unknown): value is ContentJobData {
  try {
    assertContentJobData(value);
    return true;
  } catch {
    return false;
  }
}

export function contentJobLogMetadata(data: ContentJobData, attempt?: number) {
  return {
    jobType: data.type,
    jobVersion: data.version,
    correlationId: data.correlationId,
    pipelineRunId: data.pipelineRunId,
    sourceId: data.sourceId ?? null,
    attempt: attempt ?? data.attempt,
    timeoutMs: CONTENT_JOB_POLICIES[data.type].timeoutMs,
  };
}

export function contentBackoffStrategy(
  attemptsMade: number,
  type: string | undefined,
  error?: Error & ContentJobFailure,
  _job?: MinimalJob,
): number {
  if (type !== 'content-v2') return 5_000;
  const decision = retryDecision(error ?? {}, attemptsMade);
  return decision.retry ? decision.delayMs : -1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
