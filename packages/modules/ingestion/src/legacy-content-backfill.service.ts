import { Injectable } from '@nestjs/common';
import {
  CanonicalContentStatus,
  ContentLocalizationStatus,
  ContentProvenanceStatus,
  EventStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@nora/database';

export interface BackfillOptions {
  dryRun: boolean;
  batchSize: number;
  cursor?: string;
}
export interface BackfillReport {
  scanned: number;
  created: number;
  reused: number;
  localizations: number;
  skipped: number;
  nextCursor: string | null;
  dryRun: boolean;
}

@Injectable()
export class LegacyContentBackfillService {
  constructor(private readonly prisma: PrismaService) {}
  async run(options: BackfillOptions): Promise<BackfillReport> {
    const events = await this.prisma.event.findMany({
      where: { status: EventStatus.PROCESSED },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      include: {
        source: true,
        insightEvents: { include: { insight: { include: { localizations: true } } } },
      },
    });
    const report: BackfillReport = {
      scanned: events.length,
      created: 0,
      reused: 0,
      localizations: 0,
      skipped: 0,
      nextCursor: events.at(-1)?.id ?? null,
      dryRun: options.dryRun,
    };
    for (const event of events) {
      const existing = await this.prisma.canonicalContent.findFirst({
        where: {
          OR: [
            ...(event.url ? [{ canonicalUrl: event.url }] : []),
            { sourceId: event.sourceId, externalId: event.externalId },
          ],
        },
      });
      if (existing) {
        report.reused += 1;
        continue;
      }
      const localizationCount = event.insightEvents.reduce(
        (sum, link) => sum + link.insight.localizations.length,
        0,
      );
      if (options.dryRun) {
        report.created += 1;
        report.localizations += localizationCount;
        continue;
      }
      try {
        const canonical = await this.prisma.canonicalContent.create({
          data: {
            sourceId: event.sourceId,
            canonicalUrl: event.url,
            externalId: event.externalId,
            contentHash: event.contentHash,
            originalTitle: event.title,
            originalContent: event.content,
            originalExcerpt: event.summary,
            sourceLanguage: event.language ?? 'en',
            publisher: event.source.name,
            author: event.author,
            publishedAt: event.publishedAt,
            status: CanonicalContentStatus.READY,
            provenanceStatus: ContentProvenanceStatus.VERIFIED,
            verifiedAt: event.processedAt ?? event.updatedAt,
            markets: stringArray(jsonRecord(event.metadata).markets),
            topics: topics(event.type, event.metadata),
            sourceTier: numberValue(jsonRecord(event.source.config).sourceTier, 3),
            authorityScore: numberValue(jsonRecord(event.source.config).authorityScore, 0.5),
            metadata: {
              legacyEventId: event.id,
              legacySourceSubscriptionId: event.sourceSubscriptionId,
              backfillVersion: 'legacy-content-backfill-v1',
            },
          },
        });
        report.created += 1;
        const seenLocales = new Set<string>();
        for (const link of event.insightEvents)
          for (const localization of link.insight.localizations) {
            if (seenLocales.has(localization.locale)) continue;
            seenLocales.add(localization.locale);
            const passed = localization.validationStatus === 'PASSED';
            await this.prisma.contentLocalization.create({
              data: {
                canonicalContentId: canonical.id,
                locale: localization.locale,
                sourceContentHash: localization.sourceContentHash ?? event.contentHash,
                policyVersion: localization.promptVersion ?? 'legacy-backfill-v1',
                glossaryVersion: 'legacy',
                title: localization.title,
                summary: localization.content,
                status: passed
                  ? ContentLocalizationStatus.VERIFIED
                  : ContentLocalizationStatus.REJECTED,
                qualityScore: localization.qualityScore,
                failureCodes: passed ? [] : ['LEGACY_VALIDATION_REJECTED'],
                provider: localization.provider,
                model: localization.model,
                generatedAt: localization.generatedAt,
                verifiedAt: passed ? localization.updatedAt : null,
                metadata: {
                  legacyInsightId: link.insightId,
                  legacyLocalizationId: localization.id,
                  relevanceReason: localization.relevanceReason,
                  suggestedAction: localization.suggestedAction,
                },
              },
            });
            report.localizations += 1;
          }
      } catch {
        report.skipped += 1;
      }
    }
    return report;
  }
}

export function parseBackfillArgs(args: string[]): BackfillOptions {
  const batchArg = args.find((arg) => arg.startsWith('--batch-size='));
  const cursorArg = args.find((arg) => arg.startsWith('--cursor='));
  const batchSize = batchArg ? Number(batchArg.split('=')[1]) : 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    throw new Error('BACKFILL_BATCH_SIZE_INVALID');
  return {
    dryRun: args.includes('--dry-run'),
    batchSize,
    ...(cursorArg ? { cursor: cursorArg.slice('--cursor='.length) } : {}),
  };
}
function topics(type: string, metadata: Prisma.JsonValue): string[] {
  const result = stringArray(jsonRecord(metadata).topics);
  return result.length ? result : [type.toLocaleLowerCase('en-US')];
}
function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
