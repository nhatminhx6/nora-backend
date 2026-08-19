import { Injectable } from '@nestjs/common';
import { Prisma, SourceCircuitState, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '@nora/database';

const FAILURE_THRESHOLD = 5;
const RATE_MINIMUM = 4;
const RATE_THRESHOLD = 0.5;
const PARSER_MINIMUM = 10;
const PARSER_REJECT_THRESHOLD = 0.4;
const BASE_OPEN_MS = 15 * 60_000;

interface HealthMetrics {
  attempts: number;
  successes: number;
  parserAttempts: number;
  parserRejected: number;
  errors: Record<string, number>;
  lastAttemptAt?: string;
}

@Injectable()
export class SourceHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async recordSuccess(subscriptionId: string, now = new Date()): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.sourceSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
      });
      if (subscription.circuitState === SourceCircuitState.MANUAL_PAUSED) return;
      const metrics = parseMetrics(subscription.healthMetrics);
      metrics.attempts += 1;
      metrics.successes += 1;
      metrics.lastAttemptAt = now.toISOString();
      await tx.sourceSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          circuitState: SourceCircuitState.CLOSED,
          circuitOpenedAt: null,
          nextProbeAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastSyncAt: now,
          lastSuccessAt: now,
          consecutiveFailures: 0,
          lastErrorCode: null,
          healthMetrics: metrics as unknown as Prisma.InputJsonObject,
        },
      });
    });
  }

  async recordFailure(subscriptionId: string, errorCode: string, now = new Date()): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.sourceSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
      });
      if (subscription.circuitState === SourceCircuitState.MANUAL_PAUSED) return;
      const metrics = parseMetrics(subscription.healthMetrics);
      metrics.attempts += 1;
      metrics.errors[errorCode] = (metrics.errors[errorCode] ?? 0) + 1;
      metrics.lastAttemptAt = now.toISOString();
      const consecutiveFailures = subscription.consecutiveFailures + 1;
      const shouldOpen =
        subscription.circuitState === SourceCircuitState.HALF_OPEN ||
        consecutiveFailures >= FAILURE_THRESHOLD ||
        errorRate(metrics, 'HTTP_403') >= RATE_THRESHOLD ||
        errorRate(metrics, 'HTTP_429') >= RATE_THRESHOLD;
      const openDuration =
        BASE_OPEN_MS * Math.min(8, 2 ** Math.max(0, consecutiveFailures - FAILURE_THRESHOLD));
      await tx.sourceSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: shouldOpen ? SubscriptionStatus.PAUSED : subscription.status,
          circuitState: shouldOpen ? SourceCircuitState.OPEN : subscription.circuitState,
          circuitOpenedAt: shouldOpen ? now : subscription.circuitOpenedAt,
          nextProbeAt: shouldOpen
            ? new Date(now.getTime() + openDuration)
            : subscription.nextProbeAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastSyncAt: now,
          consecutiveFailures,
          lastErrorCode: errorCode,
          healthMetrics: metrics as unknown as Prisma.InputJsonObject,
        },
      });
    });
  }

  async recordParserResult(
    subscriptionId: string,
    rejected: boolean,
    now = new Date(),
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.sourceSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
      });
      if (subscription.circuitState === SourceCircuitState.MANUAL_PAUSED) return;
      const metrics = parseMetrics(subscription.healthMetrics);
      metrics.parserAttempts += 1;
      if (rejected) metrics.parserRejected += 1;
      else metrics.successes += 1;
      metrics.lastAttemptAt = now.toISOString();
      const parserRate =
        metrics.parserAttempts >= PARSER_MINIMUM
          ? metrics.parserRejected / metrics.parserAttempts
          : 0;
      const shouldOpen = parserRate >= PARSER_REJECT_THRESHOLD;
      await tx.sourceSubscription.update({
        where: { id: subscriptionId },
        data: {
          healthMetrics: metrics as unknown as Prisma.InputJsonObject,
          ...(shouldOpen
            ? {
                status: SubscriptionStatus.PAUSED,
                circuitState: SourceCircuitState.OPEN,
                circuitOpenedAt: now,
                nextProbeAt: new Date(now.getTime() + BASE_OPEN_MS),
                lastErrorCode: 'PARSER_REJECT_SPIKE',
              }
            : {}),
        },
      });
    });
  }

  async releaseDueProbes(now = new Date()): Promise<number> {
    const result = await this.prisma.sourceSubscription.updateMany({
      where: {
        circuitState: SourceCircuitState.OPEN,
        nextProbeAt: { lte: now },
      },
      data: {
        circuitState: SourceCircuitState.HALF_OPEN,
        status: SubscriptionStatus.ACTIVE,
        nextSyncAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return result.count;
  }

  async manualPause(subscriptionId: string): Promise<void> {
    await this.prisma.sourceSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.PAUSED,
        circuitState: SourceCircuitState.MANUAL_PAUSED,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  }

  async manualResume(subscriptionId: string, now = new Date()): Promise<void> {
    await this.prisma.sourceSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        circuitState: SourceCircuitState.CLOSED,
        circuitOpenedAt: null,
        nextProbeAt: null,
        nextSyncAt: now,
        consecutiveFailures: 0,
        lastErrorCode: null,
        healthMetrics: {
          attempts: 0,
          successes: 0,
          parserAttempts: 0,
          parserRejected: 0,
          errors: {},
        },
      },
    });
  }
}

export function sourceIsStale(
  lastSuccessAt: Date | null,
  defaultIntervalSec: number,
  now = new Date(),
): boolean {
  if (!lastSuccessAt) return true;
  return now.getTime() - lastSuccessAt.getTime() > Math.max(60, defaultIntervalSec) * 3_000;
}

export function parseMetrics(value: unknown): HealthMetrics {
  const input = record(value);
  const errors = record(input.errors);
  return {
    attempts: nonNegativeInteger(input.attempts),
    successes: nonNegativeInteger(input.successes),
    parserAttempts: nonNegativeInteger(input.parserAttempts),
    parserRejected: nonNegativeInteger(input.parserRejected),
    errors: Object.fromEntries(
      Object.entries(errors).flatMap(([key, count]) =>
        typeof count === 'number' && Number.isFinite(count) && count >= 0
          ? [[key, Math.trunc(count)]]
          : [],
      ),
    ),
    ...(typeof input.lastAttemptAt === 'string' ? { lastAttemptAt: input.lastAttemptAt } : {}),
  };
}

function errorRate(metrics: HealthMetrics, code: string): number {
  return metrics.attempts >= RATE_MINIMUM ? (metrics.errors[code] ?? 0) / metrics.attempts : 0;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
