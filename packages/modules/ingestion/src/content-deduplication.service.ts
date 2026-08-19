import { Injectable } from '@nestjs/common';
import { CanonicalContent } from '@prisma/client';
import { PrismaService } from '@nora/database';
import { normalizeSemanticText } from './canonical-content.service';

export type DuplicateKind =
  | 'SOURCE_EXTERNAL_ID'
  | 'CANONICAL_URL'
  | 'EXACT_CONTENT_HASH'
  | 'NORMALIZED_FINGERPRINT'
  | 'NEAR_EXACT';

export interface DuplicateDecision {
  duplicate: boolean;
  kind?: DuplicateKind;
  score: number;
}

@Injectable()
export class ContentDeduplicationService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(canonicalContentId: string) {
    const current = await this.prisma.canonicalContent.findUniqueOrThrow({
      where: { id: canonicalContentId },
    });
    const windowStart = new Date(current.publishedAt.getTime() - 3 * 86_400_000);
    const windowEnd = new Date(current.publishedAt.getTime() + 3 * 86_400_000);
    const candidates = await this.prisma.canonicalContent.findMany({
      where: {
        id: { not: current.id },
        duplicateOfId: null,
        publishedAt: { gte: windowStart, lte: windowEnd },
      },
      orderBy: [{ publishedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const matches = candidates.flatMap((candidate) => {
      const decision = classifyDuplicate(current, candidate);
      return decision.duplicate ? [{ content: candidate, decision }] : [];
    });
    if (matches.length === 0)
      return { duplicate: false, canonicalContentId: current.id, duplicateOfId: null };

    const best = matches.sort((left, right) => {
      const priority =
        duplicatePriority(left.decision.kind!) - duplicatePriority(right.decision.kind!);
      return priority || right.decision.score - left.decision.score;
    })[0]!;
    const survivor = deterministicSurvivor(current, best.content);
    const duplicate = survivor.id === current.id ? best.content : current;
    await this.prisma.$transaction(async (tx) => {
      if (survivor.id === current.id) {
        await tx.canonicalContent.updateMany({
          where: { duplicateOfId: duplicate.id },
          data: { duplicateOfId: survivor.id },
        });
      }
      await tx.canonicalContent.update({
        where: { id: duplicate.id },
        data: {
          duplicateOfId: survivor.id,
          duplicateKind: best.decision.kind,
          duplicateScore: best.decision.score,
        },
      });
    });
    return {
      duplicate: true,
      canonicalContentId: survivor.id,
      duplicateOfId: survivor.id,
      duplicateId: duplicate.id,
      kind: best.decision.kind,
      score: best.decision.score,
    };
  }
}

export function classifyDuplicate(
  left: Pick<
    CanonicalContent,
    | 'sourceId'
    | 'externalId'
    | 'canonicalUrl'
    | 'contentHash'
    | 'originalTitle'
    | 'originalContent'
    | 'publishedAt'
  >,
  right: Pick<
    CanonicalContent,
    | 'sourceId'
    | 'externalId'
    | 'canonicalUrl'
    | 'contentHash'
    | 'originalTitle'
    | 'originalContent'
    | 'publishedAt'
  >,
): DuplicateDecision {
  if (left.sourceId === right.sourceId && left.externalId === right.externalId)
    return { duplicate: true, kind: 'SOURCE_EXTERNAL_ID', score: 1 };
  if (left.canonicalUrl && left.canonicalUrl === right.canonicalUrl)
    return { duplicate: true, kind: 'CANONICAL_URL', score: 1 };
  if (left.contentHash === right.contentHash)
    return { duplicate: true, kind: 'EXACT_CONTENT_HASH', score: 1 };

  const leftText = `${left.originalTitle}\n${left.originalContent ?? ''}`;
  const rightText = `${right.originalTitle}\n${right.originalContent ?? ''}`;
  if (!sameInvariants(leftText, rightText)) return { duplicate: false, score: 0 };
  const leftFingerprint = normalizedFingerprint(leftText);
  const rightFingerprint = normalizedFingerprint(rightText);
  if (leftFingerprint === rightFingerprint)
    return { duplicate: true, kind: 'NORMALIZED_FINGERPRINT', score: 1 };
  const score = jaccardSimilarity(tokenSet(leftFingerprint), tokenSet(rightFingerprint));
  const withinDay =
    Math.abs(left.publishedAt.getTime() - right.publishedAt.getTime()) <= 86_400_000;
  return score >= 0.9 && withinDay
    ? { duplicate: true, kind: 'NEAR_EXACT', score }
    : { duplicate: false, score };
}

export function normalizedFingerprint(value: string): string {
  return normalizeSemanticText(value)
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLocalizationEligible(input: {
  provenanceStatus: CanonicalContent['provenanceStatus'];
  duplicateOfId: string | null;
}): boolean {
  return input.provenanceStatus === 'VERIFIED' && input.duplicateOfId === null;
}

function sameInvariants(left: string, right: string): boolean {
  return setEquals(invariants(left), invariants(right));
}

function invariants(value: string): Set<string> {
  const numbers = value.match(/(?:\d{1,4}[.,:/-]?)+%?/g) ?? [];
  const entities = value.match(/\b\p{Lu}[\p{L}\d]{2,}(?:\s+\p{Lu}[\p{L}\d]*)*/gu) ?? [];
  return new Set([...numbers, ...entities.map((entity) => entity.normalize('NFKC'))]);
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(' ').filter((token) => token.length >= 2));
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function setEquals(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function deterministicSurvivor(left: CanonicalContent, right: CanonicalContent): CanonicalContent {
  const published = left.publishedAt.getTime() - right.publishedAt.getTime();
  if (published !== 0) return published < 0 ? left : right;
  const created = left.createdAt.getTime() - right.createdAt.getTime();
  if (created !== 0) return created < 0 ? left : right;
  return left.id.localeCompare(right.id) <= 0 ? left : right;
}

function duplicatePriority(kind: DuplicateKind): number {
  return [
    'SOURCE_EXTERNAL_ID',
    'CANONICAL_URL',
    'EXACT_CONTENT_HASH',
    'NORMALIZED_FINGERPRINT',
    'NEAR_EXACT',
  ].indexOf(kind);
}
