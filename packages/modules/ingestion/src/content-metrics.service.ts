import { Injectable } from '@nestjs/common';
import { ContentLocalizationStatus, ContentProvenanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';
import { IngestionQueue } from './ingestion.queue';
import { parseMetrics, sourceIsStale } from './source-health.service';

export interface ContentAlert {
  code:
    | 'TIER1_SOURCE_STALE'
    | 'VI_COVERAGE_LOW'
    | 'QUEUE_AGE_HIGH'
    | 'HTTP_429_SPIKE'
    | 'QUALITY_REJECTION_SPIKE';
  severity: 'warning' | 'critical';
  value: number;
  threshold: number;
}

@Injectable()
export class ContentMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: IngestionQueue,
  ) {}
  async snapshot(now = new Date()) {
    const [
      subscriptions,
      canonicalAccepted,
      duplicateGroups,
      clusters,
      clusterMembers,
      localizations,
      rejected,
      audienceMatches,
      users,
      queue,
    ] = await Promise.all([
      this.prisma.sourceSubscription.findMany({ include: { source: true } }),
      this.prisma.canonicalContent.count({
        where: { provenanceStatus: ContentProvenanceStatus.VERIFIED, duplicateOfId: null },
      }),
      this.prisma.canonicalContent.groupBy({
        by: ['duplicateKind'],
        where: { duplicateOfId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.contentCluster.count(),
      this.prisma.contentClusterMember.count(),
      this.prisma.contentLocalization.findMany({
        select: {
          locale: true,
          status: true,
          generatedAt: true,
          verifiedAt: true,
          provider: true,
          failureCodes: true,
          metadata: true,
        },
      }),
      this.prisma.canonicalContent.count({
        where: { provenanceStatus: ContentProvenanceStatus.REJECTED },
      }),
      this.prisma.contentAudienceMatch.count(),
      this.prisma.user.count(),
      this.queue.metrics(),
    ]);
    const attempts = subscriptions.reduce(
      (sum, item) => sum + parseMetrics(item.healthMetrics).attempts,
      0,
    );
    const successes = subscriptions.reduce(
      (sum, item) => sum + parseMetrics(item.healthMetrics).successes,
      0,
    );
    const errors = errorTotals(subscriptions.map((item) => item.healthMetrics));
    const verified = localizations.filter(
      (item) => item.status === ContentLocalizationStatus.VERIFIED,
    );
    const viVerified = verified.filter((item) => item.locale === 'vi').length;
    const qualityFailures = failureTotals(localizations.flatMap((item) => item.failureCodes));
    const latency = verified.flatMap((item) =>
      item.generatedAt && item.verifiedAt
        ? [item.verifiedAt.getTime() - item.generatedAt.getTime()]
        : [],
    );
    const metrics = {
      generatedAt: now,
      source: {
        requestCount: attempts,
        successRate: attempts ? successes / attempts : 1,
        errors,
        staleTier1: subscriptions.filter(
          (item) =>
            numberValue(jsonRecord(item.source.config).sourceTier, 3) === 1 &&
            sourceIsStale(item.lastSuccessAt, item.source.defaultIntervalSec, now),
        ).length,
      },
      provenance: {
        accepted: canonicalAccepted,
        rejected,
        rejectionRate: canonicalAccepted + rejected ? rejected / (canonicalAccepted + rejected) : 0,
      },
      duplicates: {
        byKind: Object.fromEntries(
          duplicateGroups.map((item) => [item.duplicateKind ?? 'UNKNOWN', item._count._all]),
        ),
        total: duplicateGroups.reduce((sum, item) => sum + item._count._all, 0),
      },
      clusters: {
        count: clusters,
        members: clusterMembers,
        compressionRatio: clusterMembers ? clusters / clusterMembers : 1,
      },
      localization: {
        verified: verified.length,
        providerErrors: localizations.filter(
          (item) => item.status === ContentLocalizationStatus.FAILED,
        ).length,
        latencyMsAverage: latency.length ? latency.reduce((a, b) => a + b, 0) / latency.length : 0,
        estimatedCostUsd: localizations.reduce(
          (sum, item) => sum + numberValue(jsonRecord(item.metadata).estimatedCostUsd, 0),
          0,
        ),
        qualityFailures,
        viCoverage: canonicalAccepted ? viVerified / canonicalAccepted : 1,
        fallbackRate: 0,
      },
      queue,
      feed: {
        audienceMatches,
        activeUsers: users,
        coveragePerUser: users ? audienceMatches / users : 0,
      },
    };
    return { metrics, alerts: contentAlerts(metrics) };
  }
}

export function contentAlerts(metrics: {
  source: { staleTier1: number; errors: Record<string, number>; requestCount: number };
  localization: { viCoverage: number; qualityFailures: Record<string, number>; verified: number };
  queue: { oldestWaitingAgeMs: number };
}): ContentAlert[] {
  const alerts: ContentAlert[] = [];
  if (metrics.source.staleTier1 > 0)
    alerts.push({
      code: 'TIER1_SOURCE_STALE',
      severity: 'critical',
      value: metrics.source.staleTier1,
      threshold: 0,
    });
  if (metrics.localization.viCoverage < 0.8)
    alerts.push({
      code: 'VI_COVERAGE_LOW',
      severity: 'critical',
      value: metrics.localization.viCoverage,
      threshold: 0.8,
    });
  if (metrics.queue.oldestWaitingAgeMs > 300_000)
    alerts.push({
      code: 'QUEUE_AGE_HIGH',
      severity: 'warning',
      value: metrics.queue.oldestWaitingAgeMs,
      threshold: 300_000,
    });
  const rate429 = (metrics.source.errors.HTTP_429 ?? 0) / Math.max(1, metrics.source.requestCount);
  if (rate429 > 0.2)
    alerts.push({ code: 'HTTP_429_SPIKE', severity: 'warning', value: rate429, threshold: 0.2 });
  const rejectionCount = Object.values(metrics.localization.qualityFailures).reduce(
    (sum, value) => sum + value,
    0,
  );
  const rejectionRate =
    rejectionCount / Math.max(1, rejectionCount + metrics.localization.verified);
  if (rejectionRate > 0.2)
    alerts.push({
      code: 'QUALITY_REJECTION_SPIKE',
      severity: 'critical',
      value: rejectionRate,
      threshold: 0.2,
    });
  return alerts;
}
function errorTotals(values: Prisma.JsonValue[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const value of values)
    for (const [code, count] of Object.entries(parseMetrics(value).errors))
      totals[code] = (totals[code] ?? 0) + count;
  return totals;
}
function failureTotals(values: string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const code of values) totals[code] = (totals[code] ?? 0) + 1;
  return totals;
}
function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
