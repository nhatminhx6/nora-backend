import { Injectable } from '@nestjs/common';
import {
  CanonicalContentStatus,
  ContentRetentionPolicy,
  ContentProvenanceStatus,
  Prisma,
} from '@prisma/client';
import { ContentLanguage, Market, isKnownLocale } from '@nora/common';
import { PrismaService } from '@nora/database';
import { CanonicalCandidate } from './source-adapter';
import { SourceProfile } from './source-profile';

const DETAIL_TIMEOUT_MS = 12_000;
const MAX_DETAIL_BYTES = 1024 * 1024;
const HARD_REJECT_CODES = new Set([
  'URL_INVALID',
  'URL_NOT_HTTPS',
  'NOT_DETAIL_URL',
  'UNEXPECTED_FINAL_DOMAIN',
  'PUBLISHER_UNKNOWN',
  'PUBLISHED_AT_INVALID',
  'SOURCE_TIER_INVALID',
  'LICENSE_POLICY_MISSING',
  'DETAIL_FETCH_TIMEOUT',
  'DETAIL_NETWORK_ERROR',
  'DETAIL_BODY_TOO_LARGE',
]);

export interface ProvenanceValidationResult {
  status: ContentProvenanceStatus;
  valid: boolean;
  errors: readonly string[];
  canonicalUrl?: string;
  verifiedAt?: Date;
  httpStatus?: number;
  languageConfidence: number;
}

@Injectable()
export class ProvenanceValidatorService {
  constructor(private readonly prisma?: PrismaService) {}

  async validateAndUpdate(
    canonicalContentId: string,
    profile: SourceProfile,
    fetchImpl: typeof fetch = fetch,
  ): Promise<ProvenanceValidationResult> {
    if (!this.prisma) throw new Error('PROVENANCE_DATABASE_REQUIRED');
    const content = await this.prisma.canonicalContent.findUniqueOrThrow({
      where: { id: canonicalContentId },
    });
    const metadata = jsonRecord(content.metadata);
    const result = await this.validate(
      {
        sourceId: content.sourceId,
        canonicalUrlCandidate: content.canonicalUrl ?? '',
        externalId: content.externalId,
        originalTitle: content.originalTitle,
        originalContent: content.originalContent ?? content.originalExcerpt ?? '',
        originalExcerpt: content.originalExcerpt ?? '',
        sourceLanguageCandidate: knownLanguage(content.sourceLanguage),
        publishedAtCandidate: content.publishedAt,
        ...(content.updatedAtFromSource
          ? { sourceUpdatedAtCandidate: content.updatedAtFromSource }
          : {}),
        publisher: content.publisher,
        ...(content.author ? { author: content.author } : {}),
        topicHints: content.topics,
        marketHints: content.markets as Market[],
        rawEvidence: [],
        fetchedAt:
          typeof metadata.fetchedAt === 'string' ? new Date(metadata.fetchedAt) : content.createdAt,
      },
      profile,
      fetchImpl,
    );
    await this.prisma.canonicalContent.update({
      where: { id: canonicalContentId },
      data: {
        provenanceStatus: result.status,
        status:
          result.status === ContentProvenanceStatus.REJECTED
            ? CanonicalContentStatus.REJECTED
            : CanonicalContentStatus.PENDING,
        verifiedAt: result.verifiedAt ?? null,
        metadata: {
          ...metadata,
          provenanceValidation: {
            errors: [...result.errors],
            httpStatus: result.httpStatus ?? '[NULL]',
            languageConfidence: result.languageConfidence,
          },
        } as Prisma.InputJsonObject,
      },
    });
    return result;
  }

  async validate(
    candidate: CanonicalCandidate,
    profile: SourceProfile,
    fetchImpl: typeof fetch = fetch,
  ): Promise<ProvenanceValidationResult> {
    const hardErrors: string[] = [];
    const reviewErrors: string[] = [];
    let url: URL | undefined;
    try {
      url = new URL(candidate.canonicalUrlCandidate);
      if (url.protocol !== 'https:') hardErrors.push('URL_NOT_HTTPS');
      if (url.pathname === '/' || url.pathname.length < 5) hardErrors.push('NOT_DETAIL_URL');
    } catch {
      hardErrors.push('URL_INVALID');
    }
    if (!candidate.publisher || candidate.publisher === 'Unknown')
      hardErrors.push('PUBLISHER_UNKNOWN');
    if (Number.isNaN(candidate.publishedAtCandidate.getTime()))
      hardErrors.push('PUBLISHED_AT_INVALID');
    if (![1, 2, 3].includes(profile.sourceTier)) hardErrors.push('SOURCE_TIER_INVALID');
    if (!Object.values(ContentRetentionPolicy).includes(profile.licensePolicy))
      hardErrors.push('LICENSE_POLICY_MISSING');

    const language = languageConfidence(
      `${candidate.originalTitle}\n${candidate.originalContent}`,
      candidate.sourceLanguageCandidate,
    );
    if (language.confidence < 0.7 || language.detected !== profile.language)
      reviewErrors.push('LANGUAGE_CONFIDENCE_LOW');

    let finalUrl: URL | undefined;
    let httpStatus: number | undefined;
    if (url && hardErrors.length === 0) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          redirect: 'follow',
          headers: {
            Accept: 'text/html,application/xhtml+xml;q=0.9',
            'User-Agent': 'NoraProvenance/1.0',
          },
          signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
        });
      } catch (error) {
        hardErrors.push(
          error instanceof DOMException && error.name === 'TimeoutError'
            ? 'DETAIL_FETCH_TIMEOUT'
            : 'DETAIL_NETWORK_ERROR',
        );
        return result(hardErrors, reviewErrors, language.confidence);
      }
      httpStatus = response.status;
      if (!response.ok) hardErrors.push(`HTTP_${response.status}`);
      try {
        finalUrl = new URL(response.url || url.toString());
        const expectedUrl = new URL(profile.feedUrl);
        if (!samePublisherDomain(finalUrl.hostname, expectedUrl.hostname))
          hardErrors.push('UNEXPECTED_FINAL_DOMAIN');
      } catch {
        hardErrors.push('URL_INVALID');
      }
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_DETAIL_BYTES)
        hardErrors.push('DETAIL_BODY_TOO_LARGE');
      if (response.ok && !hardErrors.includes('DETAIL_BODY_TOO_LARGE')) {
        const html = (await response.text()).slice(0, MAX_DETAIL_BYTES + 1);
        if (html.length > MAX_DETAIL_BYTES) hardErrors.push('DETAIL_BODY_TOO_LARGE');
        else if (!contentMatchesDetail(html, candidate))
          reviewErrors.push('DETAIL_CONTENT_MISMATCH');
      }
    }
    return result(
      hardErrors,
      reviewErrors,
      language.confidence,
      finalUrl?.toString() ?? url?.toString(),
      httpStatus,
    );
  }
}

export function samePublisherDomain(actual: string, expected: string): boolean {
  const normalize = (hostname: string) => hostname.toLocaleLowerCase('en-US').replace(/^www\./, '');
  const left = normalize(actual);
  const right = normalize(expected);
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

export function contentMatchesDetail(html: string, candidate: CanonicalCandidate): boolean {
  const haystack = searchableText(html);
  const titleTokens = significantTokens(candidate.originalTitle);
  const contentTokens = significantTokens(candidate.originalContent).slice(0, 12);
  const titleMatches = titleTokens.filter((token) => haystack.includes(token)).length;
  const contentMatches = contentTokens.filter((token) => haystack.includes(token)).length;
  return (
    titleTokens.length >= 2 &&
    titleMatches / titleTokens.length >= 0.6 &&
    (contentTokens.length < 4 || contentMatches / contentTokens.length >= 0.35)
  );
}

export function languageConfidence(
  value: string,
  candidateLanguage: CanonicalCandidate['sourceLanguageCandidate'],
): { detected: 'vi' | 'en'; confidence: number } {
  const letters = value.match(/\p{L}/gu)?.length ?? 0;
  const vietnamese =
    value.match(/[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/giu)
      ?.length ?? 0;
  const detected = vietnamese >= 3 ? 'vi' : 'en';
  const sampleConfidence = Math.min(1, letters / 80);
  const signalConfidence = detected === 'vi' ? Math.min(1, 0.65 + vietnamese / 20) : 0.9;
  return {
    detected,
    confidence:
      Math.min(sampleConfidence, signalConfidence) * (detected === candidateLanguage ? 1 : 0.5),
  };
}

function result(
  hardErrors: string[],
  reviewErrors: string[],
  confidence: number,
  canonicalUrl?: string,
  httpStatus?: number,
): ProvenanceValidationResult {
  const normalizedHardErrors = hardErrors.filter(
    (code) => HARD_REJECT_CODES.has(code) || /^HTTP_\d{3}$/.test(code),
  );
  const errors = [...new Set([...normalizedHardErrors, ...reviewErrors])];
  const status = normalizedHardErrors.length
    ? ContentProvenanceStatus.REJECTED
    : reviewErrors.length
      ? ContentProvenanceStatus.NEEDS_REVIEW
      : ContentProvenanceStatus.VERIFIED;
  return {
    status,
    valid: status === ContentProvenanceStatus.VERIFIED,
    errors,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    ...(status === ContentProvenanceStatus.VERIFIED ? { verifiedAt: new Date() } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    languageConfidence: confidence,
  };
}

function searchableText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/g, ' ')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ');
}

function significantTokens(value: string): string[] {
  return [
    ...new Set(
      searchableText(value)
        .split(' ')
        .filter((token) => token.length >= 3),
    ),
  ];
}

function knownLanguage(value: string): ContentLanguage {
  return isKnownLocale(value) ? value : 'en';
}

function jsonRecord(value: Prisma.JsonValue): Record<string, Prisma.InputJsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, Prisma.InputJsonValue>)
    : {};
}
