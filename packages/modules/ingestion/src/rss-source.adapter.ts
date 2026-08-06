import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import {
  NormalizedSourceItem,
  SourceAdapter,
  SourceFetchInput,
  SourceValidationResult,
} from './source-adapter';

type RssPayload = Record<string, unknown>;

@Injectable()
export class RssSourceAdapter implements SourceAdapter<RssPayload> {
  readonly key = 'generic-rss';
  private readonly parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

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
    return Array.isArray(channel.item)
      ? channel.item.map((item) => this.object(item))
      : channel.item
        ? [this.object(channel.item)]
        : [];
  }

  normalize(payload: RssPayload): NormalizedSourceItem | null {
    const title = this.clean(this.text(payload.title));
    const link = this.text(payload.link).trim();
    const publishedAt = new Date(this.text(payload.pubDate));
    if (!title || !link || Number.isNaN(publishedAt.getTime())) return null;
    const source = this.object(payload.source);
    const content = this.clean(this.text(payload.description)) || title;
    return {
      externalId: this.text(payload.guid).trim() || link,
      title,
      content,
      canonicalUrl: link,
      publishedAt,
      publisher: this.clean(this.text(source['#text'])) || 'VnExpress',
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
      return {
        valid: errors.length === 0,
        errors,
        canonicalUrl: response.url,
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
}
