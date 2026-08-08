import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import {
  NormalizedSourceItem,
  SourceAdapter,
  SourceFetchInput,
  SourceValidationResult,
} from './source-adapter';
import { ArticleContentExtractor } from './article-content.extractor';

type RssPayload = Record<string, unknown>;

@Injectable()
export class RssSourceAdapter implements SourceAdapter<RssPayload> {
  readonly key = 'generic-rss';
  private readonly parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  constructor(private readonly articleExtractor: ArticleContentExtractor) {}

  async fetch(input: SourceFetchInput): Promise<RssPayload[]> {
    const response = await fetch(input.url, {
      headers: {
        Accept: 'application/rss+xml, application/xml;q=0.9',
        'User-Agent': 'NoraBot/0.2 (+source-ingestion)',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`RSS returned HTTP ${response.status}`);
    const document = this.object(this.parser.parse(await response.text()));
    const channel = this.object(this.object(document.rss).channel);
    const feed = this.object(document.feed);
    const entries = channel.item ?? feed.entry;
    return Array.isArray(entries)
      ? entries.map((item) => this.object(item))
      : entries
        ? [this.object(entries)]
        : [];
  }

  normalize(payload: RssPayload): NormalizedSourceItem | null {
    const title = this.clean(this.text(payload.title));
    const link = this.link(payload.link);
    const publishedAt = new Date(
      this.text(payload.pubDate) || this.text(payload.published) || this.text(payload.updated),
    );
    if (!title || !link || Number.isNaN(publishedAt.getTime())) return null;
    const source = this.object(payload.source);
    const content =
      this.clean(
        this.text(payload.description) || this.text(payload.content) || this.text(payload.summary),
      ) || title;
    const author = this.object(payload.author);
    return {
      externalId: this.text(payload.guid).trim() || this.text(payload.id).trim() || link,
      title,
      content,
      canonicalUrl: link,
      publishedAt,
      publisher: this.clean(this.text(source['#text']) || this.text(author.name)) || 'Unknown',
      language: this.detectLanguage(`${title} ${content}`),
      metadata: { discoveryUrl: this.text(source['@_url']).trim() || link },
    };
  }

  async validate(item: NormalizedSourceItem): Promise<SourceValidationResult> {
    const errors: string[] = [];
    let url: URL;
    try {
      url = new URL(item.canonicalUrl);
    } catch {
      return { valid: false, errors: ['URL_INVALID'] };
    }
    if (url.protocol !== 'https:') errors.push('URL_NOT_HTTPS');
    if (['example.com', 'localhost', '127.0.0.1'].includes(url.hostname))
      errors.push('PLACEHOLDER_HOST');
    if (url.pathname === '/' || url.pathname.length < 5) errors.push('NOT_ARTICLE_PATH');
    if (!item.title || !item.content) errors.push('CONTENT_REQUIRED');
    if (errors.length > 0) return { valid: false, errors };

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9',
          'User-Agent': 'NoraDataQuality/1.0',
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) errors.push(`HTTP_${response.status}`);
      const finalUrl = new URL(response.url);
      if (finalUrl.hostname !== url.hostname) errors.push('UNEXPECTED_FINAL_DOMAIN');
      if (response.ok) {
        const extracted = this.articleExtractor.extract(await response.text(), item.content);
        item.content = extracted.content;
        item.metadata.contentOrigin = extracted.origin;
        item.metadata.extractedLength = String(extracted.content.length);
        if (extracted.content.length < 80) errors.push('CONTENT_TOO_SHORT');
        if (this.wordCount(extracted.content) < 15) errors.push('CONTENT_LOW_INFORMATION');
        if (extracted.canonicalUrl) {
          const extractedUrl = new URL(extracted.canonicalUrl, response.url);
          if (extractedUrl.hostname === finalUrl.hostname)
            item.canonicalUrl = extractedUrl.toString();
        }
      }
      return {
        valid: errors.length === 0,
        errors,
        canonicalUrl: item.canonicalUrl || response.url,
        verifiedAt: new Date(),
      };
    } catch {
      return { valid: false, errors: ['FETCH_FAILED'] };
    }
  }

  private detectLanguage(value: string): 'vi' | 'en' {
    const count =
      value.match(/[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/giu)
        ?.length ?? 0;
    return count >= 3 ? 'vi' : 'en';
  }

  private wordCount(value: string): number {
    return value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  }

  private clean(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    const nested = this.object(value)['#text'];
    return typeof nested === 'string' || typeof nested === 'number' ? String(nested) : '';
  }

  private link(value: unknown): string {
    const candidates = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') return candidate.trim();
      const object = this.object(candidate);
      const href = this.text(object['@_href']).trim();
      const relation = this.text(object['@_rel']).trim();
      if (href && relation !== 'enclosure') return href;
    }
    return '';
  }
}
