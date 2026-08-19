import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ContentProvenanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';
import { CanonicalCandidate, ProvenanceResult } from './source-adapter';

export interface CanonicalPersistResult {
  id: string;
  contentHash: string;
  created: boolean;
  revised: boolean;
}

@Injectable()
export class CanonicalContentService {
  constructor(private readonly prisma: PrismaService) {}

  async persist(
    candidate: CanonicalCandidate,
    provenance?: ProvenanceResult,
  ): Promise<CanonicalPersistResult> {
    const normalized = normalizeCanonicalCandidate(candidate);
    const contentHash = semanticContentHash(normalized.originalTitle, normalized.originalContent);
    const source = await this.prisma.source.findUniqueOrThrow({
      where: { id: normalized.sourceId },
      select: { config: true },
    });
    const sourceConfig = record(source.config);
    const sourceTier = boundedSourceTier(sourceConfig.sourceTier);
    const authorityScore = boundedAuthorityScore(sourceConfig.authorityScore);
    const provenanceStatus = provenance?.valid
      ? ContentProvenanceStatus.VERIFIED
      : ContentProvenanceStatus.PENDING;

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.canonicalContent.findFirst({
          where: {
            OR: [
              { sourceId: normalized.sourceId, externalId: normalized.externalId },
              { canonicalUrl: normalized.canonicalUrlCandidate },
            ],
          },
        });
        if (!existing) {
          const created = await tx.canonicalContent.create({
            data: {
              sourceId: normalized.sourceId,
              rawPayloadId: rawPayloadId(normalized),
              canonicalUrl: normalized.canonicalUrlCandidate,
              externalId: normalized.externalId,
              contentHash,
              originalTitle: normalized.originalTitle,
              originalContent: normalized.originalContent,
              originalExcerpt: normalized.originalExcerpt,
              sourceLanguage: normalized.sourceLanguageCandidate,
              publisher: normalized.publisher,
              author: normalized.author,
              publishedAt: normalized.publishedAtCandidate,
              updatedAtFromSource: normalized.sourceUpdatedAtCandidate,
              verifiedAt: provenance?.verifiedAt,
              provenanceStatus,
              markets: [...normalized.marketHints],
              topics: [...normalized.topicHints],
              sourceTier,
              authorityScore,
              metadata: canonicalMetadata(normalized),
            },
            select: { id: true },
          });
          return { id: created.id, contentHash, created: true, revised: false };
        }
        if (existing.sourceId !== normalized.sourceId)
          throw new Error('CANONICAL_URL_SOURCE_CONFLICT');

        if (existing.contentHash === contentHash) {
          await tx.canonicalContent.update({
            where: { id: existing.id },
            data: {
              rawPayloadId: rawPayloadId(normalized) ?? existing.rawPayloadId,
              verifiedAt: provenance?.verifiedAt ?? existing.verifiedAt,
              provenanceStatus: provenance ? provenanceStatus : existing.provenanceStatus,
              updatedAtFromSource:
                normalized.sourceUpdatedAtCandidate ?? existing.updatedAtFromSource,
              metadata: canonicalMetadata(normalized),
            },
          });
          return { id: existing.id, contentHash, created: false, revised: false };
        }

        const revision = await tx.contentRevision.aggregate({
          where: { canonicalContentId: existing.id },
          _max: { revisionNumber: true },
        });
        await tx.contentRevision.create({
          data: {
            canonicalContentId: existing.id,
            revisionNumber: (revision._max.revisionNumber ?? 0) + 1,
            contentHash: existing.contentHash,
            canonicalUrl: existing.canonicalUrl,
            originalTitle: existing.originalTitle,
            originalContent: existing.originalContent,
            originalExcerpt: existing.originalExcerpt,
            sourceLanguage: existing.sourceLanguage,
            publisher: existing.publisher,
            author: existing.author,
            publishedAt: existing.publishedAt,
            updatedAtFromSource: existing.updatedAtFromSource,
            provenanceStatus: existing.provenanceStatus,
            changeReason: 'SOURCE_CONTENT_CHANGED',
            metadata: existing.metadata as Prisma.InputJsonValue,
          },
        });
        await tx.canonicalContent.update({
          where: { id: existing.id },
          data: {
            rawPayloadId: rawPayloadId(normalized) ?? existing.rawPayloadId,
            canonicalUrl: normalized.canonicalUrlCandidate,
            externalId: normalized.externalId,
            contentHash,
            originalTitle: normalized.originalTitle,
            originalContent: normalized.originalContent,
            originalExcerpt: normalized.originalExcerpt,
            sourceLanguage: normalized.sourceLanguageCandidate,
            publisher: normalized.publisher,
            author: normalized.author,
            updatedAtFromSource: normalized.sourceUpdatedAtCandidate,
            verifiedAt: provenance?.verifiedAt ?? existing.verifiedAt,
            provenanceStatus: provenance ? provenanceStatus : existing.provenanceStatus,
            markets: [...normalized.marketHints],
            topics: [...normalized.topicHints],
            metadata: canonicalMetadata(normalized),
          },
        });
        return { id: existing.id, contentHash, created: false, revised: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

export function normalizeSemanticText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function semanticContentHash(title: string, content: string): string {
  return createHash('sha256')
    .update(`${normalizeSemanticText(title)}\n${normalizeSemanticText(content)}`)
    .digest('hex');
}

export function normalizeCanonicalCandidate(candidate: CanonicalCandidate): CanonicalCandidate {
  return {
    ...candidate,
    canonicalUrlCandidate: new URL(candidate.canonicalUrlCandidate).toString(),
    externalId: normalizeSemanticText(candidate.externalId),
    originalTitle: normalizeSemanticText(candidate.originalTitle),
    originalContent: normalizeSemanticText(candidate.originalContent),
    originalExcerpt: normalizeSemanticText(candidate.originalExcerpt),
    publisher: normalizeSemanticText(candidate.publisher),
    ...(candidate.author ? { author: normalizeSemanticText(candidate.author) } : {}),
  };
}

function canonicalMetadata(candidate: CanonicalCandidate): Prisma.InputJsonObject {
  return {
    fetchedAt: candidate.fetchedAt.toISOString(),
    rawEvidence: candidate.rawEvidence.map((evidence) => ({
      rawPayloadId: evidence.rawPayloadId ?? '[NULL]',
      payloadHash: evidence.payloadHash,
      path: evidence.path,
    })),
  };
}

function rawPayloadId(candidate: CanonicalCandidate): string | undefined {
  return candidate.rawEvidence.find((evidence) => evidence.rawPayloadId)?.rawPayloadId;
}

function boundedSourceTier(value: unknown): number {
  return value === 1 || value === 2 || value === 3 ? value : 3;
}

function boundedAuthorityScore(value: unknown): number {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
