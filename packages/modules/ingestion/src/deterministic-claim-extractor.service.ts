import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';

export const DETERMINISTIC_EXTRACTION_VERSION = 'deterministic-facts-v1';

export type FactKind = 'PERCENTAGE' | 'CURRENCY' | 'NUMBER' | 'DATE_TIME' | 'PRODUCT_VERSION';

export interface ExtractedFact {
  kind: FactKind;
  raw: string;
  normalized: string;
  start: number;
  end: number;
}

export interface ExtractedClaim {
  text: string;
  start: number;
  end: number;
  entities: string[];
  facts: ExtractedFact[];
  directions: string[];
  attribution?: string;
  certainty?: string;
}

export interface DeterministicExtraction {
  claims: ExtractedClaim[];
  preservationConstraints: string[];
}

@Injectable()
export class DeterministicClaimExtractorService {
  constructor(private readonly prisma?: PrismaService) {}

  extract(text: string): DeterministicExtraction {
    const claims = sentenceRanges(text).flatMap(({ text: sentence, start, end }) => {
      const facts = extractFacts(sentence, start);
      const directions = extractDirections(sentence);
      const attribution = extractAttribution(sentence);
      const entities = [
        ...new Set([...extractEntities(sentence), ...(attribution ? [attribution] : [])]),
      ];
      const certainty = extractCertainty(sentence);
      if (!sentence.trim()) return [];
      return [
        { text: sentence.trim(), start, end, entities, facts, directions, attribution, certainty },
      ];
    });
    return {
      claims,
      preservationConstraints: [
        ...new Set(
          claims.flatMap((claim) => [
            ...claim.entities,
            ...claim.facts.map((fact) => fact.raw),
            ...claim.directions,
          ]),
        ),
      ],
    };
  }

  async extractAndPersist(canonicalContentId: string): Promise<DeterministicExtraction> {
    if (!this.prisma) throw new Error('CLAIM_DATABASE_REQUIRED');
    const content = await this.prisma.canonicalContent.findUniqueOrThrow({
      where: { id: canonicalContentId },
      select: { originalTitle: true, originalContent: true, contentHash: true },
    });
    const sourceText = `${content.originalTitle}\n${content.originalContent ?? ''}`.trim();
    const extraction = this.extract(sourceText);
    await this.prisma.$transaction(async (tx) => {
      await tx.contentClaim.deleteMany({
        where: { canonicalContentId, extractionVersion: DETERMINISTIC_EXTRACTION_VERSION },
      });
      if (extraction.claims.length > 0) {
        await tx.contentClaim.createMany({
          data: extraction.claims.map((claim) => ({
            canonicalContentId,
            claimHash: claimHash(claim.text),
            claimType: claim.directions.length > 0 ? 'DIRECTIONAL_STATEMENT' : 'FACTUAL_STATEMENT',
            text: claim.text,
            evidence: [
              { start: claim.start, end: claim.end, sourceContentHash: content.contentHash },
            ],
            entities: claim.entities,
            numbers: claim.facts
              .filter((fact) =>
                ['PERCENTAGE', 'CURRENCY', 'NUMBER', 'PRODUCT_VERSION'].includes(fact.kind),
              )
              .map(factJson),
            dates: claim.facts
              .filter((fact) => fact.kind === 'DATE_TIME')
              .flatMap((fact) => {
                const parsed = new Date(fact.normalized);
                return Number.isNaN(parsed.getTime()) ? [] : [parsed];
              }),
            certainty: claim.certainty,
            attribution: claim.attribution,
            extractionVersion: DETERMINISTIC_EXTRACTION_VERSION,
            metadata: {
              directions: claim.directions,
              facts: claim.facts.map(factJson),
              preservationConstraints: extraction.preservationConstraints,
            },
          })),
        });
      }
    });
    return extraction;
  }
}

export function extractFacts(value: string, baseOffset = 0): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const occupied: Array<[number, number]> = [];
  const add = (kind: FactKind, regex: RegExp, normalize: (raw: string) => string) => {
    for (const match of value.matchAll(regex)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (occupied.some(([left, right]) => start < right && end > left)) continue;
      occupied.push([start, end]);
      facts.push({
        kind,
        raw: match[0],
        normalized: normalize(match[0]),
        start: baseOffset + start,
        end: baseOffset + end,
      });
    }
  };
  add(
    'DATE_TIME',
    /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
    normalizeDate,
  );
  add(
    'CURRENCY',
    /(?:[$€£]\s?\d[\d.,]*(?:\s?(?:million|billion|triệu|tỷ))?|\b(?:USD|EUR|GBP|VND)\s?\d[\d.,]*(?:\s?(?:million|billion|triệu|tỷ))?|\b\d[\d.,]*\s?(?:triệu|tỷ)\s?(?:đồng|VND)\b)/giu,
    normalizeCompact,
  );
  add('PERCENTAGE', /[+-]?\d+(?:[.,]\d+)?\s?%/g, normalizeCompact);
  add(
    'PRODUCT_VERSION',
    /\b(?:GPT-?\d+(?:\.\d+)?|iPhone\s+\d+(?:\s+(?:Pro|Max|Plus))?|iOS\s+\d+(?:\.\d+)*|Android\s+\d+(?:\.\d+)*|v(?:ersion\s*)?\d+(?:\.\d+){1,3})\b/giu,
    normalizeCompact,
  );
  add('NUMBER', /\b\d+(?:[.,]\d+)?\b/g, normalizeCompact);
  return facts.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function extractEntities(value: string): string[] {
  const protectedIdentifiers =
    value.match(
      /\b(?:[A-Z]{2,}(?:-[A-Z0-9]+)*|GPT-?\d+(?:\.\d+)?|iPhone\s+\d+(?:\s+(?:Pro|Max|Plus))?|iOS\s+\d+)\b/g,
    ) ?? [];
  const named =
    value.match(/\b\p{Lu}[\p{L}\d&.-]{2,}(?:[ \t]+\p{Lu}[\p{L}\d&.-]{1,}){0,4}/gu) ?? [];
  const sentenceLeadStopwords = new Set([
    'according',
    'the',
    'a',
    'an',
    'in',
    'on',
    'after',
    'before',
    'theo',
    'cập',
  ]);
  return [
    ...new Set(
      [...protectedIdentifiers, ...named]
        .map((item) => item.trim())
        .filter((item) => {
          const normalized = item.toLocaleLowerCase('en-US');
          return ![...sentenceLeadStopwords].some(
            (word) => normalized === word || normalized.startsWith(`${word} `),
          );
        })
        .filter(
          (item) =>
            !/\b(?:GPT-?\d+(?:\.\d+)?|iPhone\s+\d+|iOS\s+\d+)\b.*\s|\s.*\b(?:GPT-?\d+(?:\.\d+)?|iPhone\s+\d+|iOS\s+\d+)\b/iu.test(
              item,
            ),
        ),
    ),
  ];
}

export function extractDirections(value: string): string[] {
  const matches =
    value.match(
      /(?<!\p{L})(?:tăng|giảm|giữ nguyên|rise|rises|rose|increase|increased|fall|falls|fell|decrease|decreased|unchanged)(?!\p{L})/giu,
    ) ?? [];
  return [...new Set(matches.map((item) => item.toLocaleLowerCase('en-US')))];
}

function extractAttribution(value: string): string | undefined {
  const match = value.match(/(?:according to|theo)\s+([^,.;:]{2,120})/iu);
  return match?.[1]?.trim();
}

function extractCertainty(value: string): string | undefined {
  const match = value.match(
    /(?<!\p{L})(?:may|might|could|likely|unlikely|confirmed|dự kiến|có thể|nhiều khả năng|xác nhận)(?!\p{L})/iu,
  );
  return match?.[0].toLocaleLowerCase('en-US');
}

function sentenceRanges(value: string): Array<{ text: string; start: number; end: number }> {
  const ranges: Array<{ text: string; start: number; end: number }> = [];
  const segments = new Intl.Segmenter(['vi', 'en'], { granularity: 'sentence' }).segment(value);
  for (const segment of segments) {
    const raw = segment.segment;
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text)
      ranges.push({
        text,
        start: segment.index + leading,
        end: segment.index + raw.trimEnd().length,
      });
  }
  return ranges;
}

function normalizeDate(raw: string): string {
  const dateOnly = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dateOnly)
    return `${dateOnly[3]}-${dateOnly[2]!.padStart(2, '0')}-${dateOnly[1]!.padStart(2, '0')}T00:00:00.000Z`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function normalizeCompact(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function factJson(fact: ExtractedFact): Prisma.InputJsonObject {
  return {
    kind: fact.kind,
    raw: fact.raw,
    normalized: fact.normalized,
    start: fact.start,
    end: fact.end,
  };
}

function claimHash(value: string): string {
  return createHash('sha256').update(value.normalize('NFC').trim()).digest('hex');
}
