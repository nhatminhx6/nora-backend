import { Injectable } from '@nestjs/common';
import { ContentLanguage } from '@nora/common';
import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import {
  CanonicalCandidate,
  FetchInputV2,
  ProvenanceResult,
  RawPayloadEnvelope,
  SourceAdapterV2,
} from './source-adapter';
import { fetchSourceEnvelope } from './raw-source-payload.service';

@Injectable()
export class RssSourceV2Adapter implements SourceAdapterV2 {
  readonly key = 'generic-rss-v2';
  private readonly parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  async fetch(input: FetchInputV2): Promise<RawPayloadEnvelope[]> {
    const response = await fetchSourceEnvelope(input.url);
    return [
      {
        sourceId: input.sourceId,
        subscriptionId: input.subscriptionId,
        requestUrl: response.requestUrl,
        finalUrl: response.finalUrl,
        httpStatus: response.status,
        contentType: response.headers['content-type'],
        fetchedAt: new Date(),
        body: response.body,
        payloadHash: response.payloadHash,
        sourceLanguage: input.sourceLanguage,
        topicHints: input.topicHints ?? [],
        marketHints: input.marketHints ?? [],
      },
    ];
  }

  async normalize(input: RawPayloadEnvelope): Promise<CanonicalCandidate[]> {
    const xml = new TextDecoder().decode(input.body);
    const document = object(this.parser.parse(xml));
    const channel = object(object(document.rss).channel);
    const feed = object(document.feed);
    const rawEntries = channel.item ?? feed.entry;
    const entries = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];
    const feedPublisher = clean(text(channel.title) || text(feed.title));

    return entries.flatMap((rawEntry, index) => {
      const entry = object(rawEntry);
      const title = clean(text(entry.title));
      const linkValue = articleLink(entry.link);
      const canonicalUrlCandidate = resolveUrl(linkValue, input.finalUrl);
      const publishedAtCandidate = new Date(
        text(entry.pubDate) || text(entry.published) || text(entry.updated),
      );
      const updatedValue = text(entry.updated);
      const sourceUpdatedAtCandidate = updatedValue ? new Date(updatedValue) : undefined;
      if (!title || !canonicalUrlCandidate || Number.isNaN(publishedAtCandidate.getTime()))
        return [];
      const originalContent = clean(
        text(entry['content:encoded']) ||
          text(entry.description) ||
          text(entry.content) ||
          text(entry.summary) ||
          title,
      );
      const source = object(entry.source);
      const authorObject = object(entry.author);
      const author = clean(text(authorObject.name) || text(entry.author));
      const publisher = clean(text(source['#text']) || feedPublisher || author) || 'Unknown';
      const externalId = clean(text(entry.guid) || text(entry.id)) || canonicalUrlCandidate;
      const sourceLanguageCandidate =
        input.sourceLanguage ?? detectLanguage(`${title} ${originalContent}`);
      return [
        {
          sourceId: input.sourceId,
          canonicalUrlCandidate,
          externalId,
          originalTitle: title,
          originalContent,
          originalExcerpt: excerpt(originalContent),
          sourceLanguageCandidate,
          publishedAtCandidate,
          ...(sourceUpdatedAtCandidate && !Number.isNaN(sourceUpdatedAtCandidate.getTime())
            ? { sourceUpdatedAtCandidate }
            : {}),
          publisher,
          ...(author ? { author } : {}),
          topicHints: input.topicHints,
          marketHints: input.marketHints,
          rawEvidence: [
            {
              rawPayloadId: input.rawPayloadId,
              payloadHash: input.payloadHash,
              path: `${feed.entry ? 'feed.entry' : 'rss.channel.item'}[${index}]`,
            },
          ],
          fetchedAt: input.fetchedAt,
        },
      ];
    });
  }

  async validate(input: CanonicalCandidate): Promise<ProvenanceResult> {
    const errors: string[] = [];
    let canonicalUrl: URL | undefined;
    try {
      canonicalUrl = new URL(input.canonicalUrlCandidate);
      if (canonicalUrl.protocol !== 'https:') errors.push('URL_NOT_HTTPS');
      if (canonicalUrl.pathname === '/' || canonicalUrl.pathname.length < 2)
        errors.push('NOT_DETAIL_URL');
    } catch {
      errors.push('URL_INVALID');
    }
    if (!input.publisher || input.publisher === 'Unknown') errors.push('PUBLISHER_UNKNOWN');
    if (!input.originalTitle || !input.originalContent) errors.push('CONTENT_REQUIRED');
    if (Number.isNaN(input.publishedAtCandidate.getTime())) errors.push('PUBLISHED_AT_INVALID');
    return {
      valid: errors.length === 0,
      errors,
      ...(canonicalUrl ? { canonicalUrl: canonicalUrl.toString() } : {}),
      ...(errors.length === 0 ? { verifiedAt: new Date() } : {}),
    };
  }
}

function articleLink(value: unknown): string {
  for (const candidate of Array.isArray(value) ? value : [value]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    const record = object(candidate);
    const relation = text(record['@_rel']).toLocaleLowerCase('en-US');
    const type = text(record['@_type']).toLocaleLowerCase('en-US');
    const href = text(record['@_href']);
    if (
      href &&
      relation !== 'enclosure' &&
      !type.startsWith('audio/') &&
      !type.startsWith('video/')
    )
      return href;
  }
  return '';
}

function resolveUrl(value: string, base: string): string {
  try {
    return value ? new URL(value, base).toString() : '';
  } catch {
    return '';
  }
}

function detectLanguage(value: string): ContentLanguage {
  const vietnamese =
    value.match(/[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/giu)
      ?.length ?? 0;
  return vietnamese >= 3 ? 'vi' : 'en';
}

function excerpt(value: string): string {
  return value.length <= 500 ? value : `${value.slice(0, 497).trimEnd()}...`;
}

function clean(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  const nested = object(value)['#text'];
  return typeof nested === 'string' || typeof nested === 'number' ? String(nested).trim() : '';
}

export function rawEnvelopeFixture(
  xml: string,
  finalUrl = 'https://publisher.test/feed.xml',
): RawPayloadEnvelope {
  const body = new TextEncoder().encode(xml);
  return {
    sourceId: '00000000-0000-0000-0000-000000000001',
    requestUrl: finalUrl,
    finalUrl,
    httpStatus: 200,
    contentType: 'application/xml',
    fetchedAt: new Date('2026-08-14T08:00:00Z'),
    body,
    payloadHash: createHash('sha256').update(body).digest('hex'),
    topicHints: ['technology'],
    marketHints: ['GLOBAL'],
  };
}
