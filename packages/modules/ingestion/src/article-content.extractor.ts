import { Injectable } from '@nestjs/common';

export interface ExtractedArticleContent {
  content: string;
  origin: 'json-ld' | 'article-html' | 'meta-description' | 'rss-description';
  canonicalUrl?: string;
}

@Injectable()
export class ArticleContentExtractor {
  extract(html: string, fallback: string): ExtractedArticleContent {
    const canonicalUrl = this.attribute(html, /<link\b[^>]*rel=["']canonical["'][^>]*>/iu, 'href');
    const jsonLd = this.jsonLdArticleBody(html);
    if (jsonLd.length >= 120) return { content: jsonLd, origin: 'json-ld', canonicalUrl };

    const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/iu)?.[1] ?? '';
    const seen = new Set<string>();
    const paragraphs = [...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)]
      .map((match) => this.clean(match[1] ?? ''))
      .filter((value) => value.length >= 30)
      .filter((value) => {
        const fingerprint = value.toLocaleLowerCase().replace(/[^a-z0-9À-ỹ]+/giu, '');
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return !/^(advertisement|đăng ký|subscribe|read more|xem thêm)/iu.test(value);
      })
      .join('\n');
    if (paragraphs.length >= 120) {
      return { content: paragraphs.slice(0, 20_000), origin: 'article-html', canonicalUrl };
    }

    const meta = this.attribute(
      html,
      /<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/iu,
      'content',
    );
    if (meta.length >= 40)
      return { content: this.clean(meta), origin: 'meta-description', canonicalUrl };
    return { content: fallback, origin: 'rss-description', canonicalUrl };
  }

  private jsonLdArticleBody(html: string): string {
    const scripts = html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
    );
    for (const match of scripts) {
      try {
        const value: unknown = JSON.parse(match[1] ?? '');
        const body = this.findArticleBody(value);
        if (body) return this.clean(body).slice(0, 20_000);
      } catch {
        // Publishers occasionally emit malformed JSON-LD; other extraction paths remain available.
      }
    }
    return '';
  }

  private findArticleBody(value: unknown): string | null {
    if (Array.isArray(value)) {
      for (const item of value) {
        const body = this.findArticleBody(item);
        if (body) return body;
      }
      return null;
    }
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.articleBody === 'string') return record.articleBody;
    for (const nested of Object.values(record)) {
      const body = this.findArticleBody(nested);
      if (body) return body;
    }
    return null;
  }

  private attribute(html: string, tagPattern: RegExp, name: string): string {
    const tag = html.match(tagPattern)?.[0] ?? '';
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return tag.match(new RegExp(`${escaped}=["']([^"']+)["']`, 'iu'))?.[1]?.trim() ?? '';
  }

  private clean(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
