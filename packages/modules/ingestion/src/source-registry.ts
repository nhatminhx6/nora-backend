import { ContentRetentionPolicy, SourceKind } from '@prisma/client';
import { SourceProfile } from './source-profile';

const ARTICLE_VERIFICATION_POLICY = 'https-article-same-publisher-v1';

const vnExpressProfile = (topic: string, label: string, feedUrl: string): SourceProfile => ({
  name: `VnExpress · ${label}`,
  slug: `vnexpress-${topic}-rss`,
  feedUrl,
  adapterKey: 'generic-rss',
  kind: SourceKind.RSS,
  language: 'vi',
  markets: topic === 'technology' ? ['VN', 'GLOBAL'] : ['VN'],
  topics: topic === 'technology' ? ['technology', 'products'] : [topic],
  sourceTier: 2,
  authorityScore: 0.85,
  licensePolicy: ContentRetentionPolicy.EXCERPT_ONLY,
  updateIntervalSec: 900,
  rateLimitPerMinute: 30,
  verificationPolicy: ARTICLE_VERIFICATION_POLICY,
  selectionPolicy: 'MATCH_TOPIC_TERMS',
  enabled: true,
});

export const SOURCE_PROFILES: readonly SourceProfile[] = [
  {
    name: 'OpenAI Newsroom',
    slug: 'openai-newsroom-rss',
    feedUrl: 'https://openai.com/news/rss.xml',
    adapterKey: 'generic-rss',
    kind: SourceKind.RSS,
    language: 'en',
    markets: ['GLOBAL', 'US'],
    topics: ['openai', 'technology'],
    sourceTier: 1,
    authorityScore: 1,
    licensePolicy: ContentRetentionPolicy.EXCERPT_ONLY,
    updateIntervalSec: 900,
    rateLimitPerMinute: 20,
    verificationPolicy: ARTICLE_VERIFICATION_POLICY,
    selectionPolicy: 'ALL_ITEMS',
    enabled: true,
  },
  {
    name: 'Apple Newsroom',
    slug: 'apple-newsroom-rss',
    feedUrl: 'https://www.apple.com/newsroom/rss-feed.rss',
    adapterKey: 'generic-rss',
    kind: SourceKind.RSS,
    language: 'en',
    markets: ['GLOBAL', 'US'],
    topics: ['apple', 'technology', 'products'],
    sourceTier: 1,
    authorityScore: 1,
    licensePolicy: ContentRetentionPolicy.EXCERPT_ONLY,
    updateIntervalSec: 900,
    rateLimitPerMinute: 20,
    verificationPolicy: ARTICLE_VERIFICATION_POLICY,
    selectionPolicy: 'ALL_ITEMS',
    enabled: true,
  },
  {
    name: 'CoinDesk',
    slug: 'coindesk-rss',
    feedUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss',
    adapterKey: 'generic-rss',
    kind: SourceKind.RSS,
    language: 'en',
    markets: ['GLOBAL', 'US'],
    topics: ['bitcoin', 'markets'],
    sourceTier: 2,
    authorityScore: 0.85,
    licensePolicy: ContentRetentionPolicy.EXCERPT_ONLY,
    updateIntervalSec: 900,
    rateLimitPerMinute: 20,
    verificationPolicy: ARTICLE_VERIFICATION_POLICY,
    selectionPolicy: 'MATCH_TOPIC_TERMS',
    enabled: true,
  },
  vnExpressProfile('travel', 'Du lịch', 'https://vnexpress.net/rss/du-lich.rss'),
  vnExpressProfile('markets', 'Kinh doanh', 'https://vnexpress.net/rss/kinh-doanh.rss'),
  vnExpressProfile(
    'technology',
    'Khoa học Công nghệ',
    'https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss',
  ),
  vnExpressProfile('career', 'Giáo dục', 'https://vnexpress.net/rss/giao-duc.rss'),
  vnExpressProfile('health', 'Sức khỏe', 'https://vnexpress.net/rss/suc-khoe.rss'),
  vnExpressProfile('sports', 'Thể thao', 'https://vnexpress.net/rss/the-thao.rss'),
  vnExpressProfile('entertainment', 'Giải trí', 'https://vnexpress.net/rss/giai-tri.rss'),
  vnExpressProfile('latest', 'Tin mới nhất', 'https://vnexpress.net/rss/tin-moi-nhat.rss'),
];

const PROFILES_BY_SLUG = new Map(SOURCE_PROFILES.map((profile) => [profile.slug, profile]));
const FALLBACK_PROFILE = PROFILES_BY_SLUG.get('vnexpress-latest-rss')!;

const TOPIC_SOURCE_SLUG: Readonly<Record<string, string>> = {
  openai: 'openai-newsroom-rss',
  apple: 'apple-newsroom-rss',
  bitcoin: 'coindesk-rss',
  travel: 'vnexpress-travel-rss',
  markets: 'vnexpress-markets-rss',
  technology: 'vnexpress-technology-rss',
  products: 'vnexpress-technology-rss',
  career: 'vnexpress-career-rss',
  health: 'vnexpress-health-rss',
  sports: 'vnexpress-sports-rss',
  entertainment: 'vnexpress-entertainment-rss',
};

export function sourceProfileBySlug(slug: string): SourceProfile | null {
  return PROFILES_BY_SLUG.get(slug) ?? null;
}

export function sourceProfilesForTopic(topic: string): readonly SourceProfile[] {
  const normalizedTopic = topic.trim().toLocaleLowerCase('en-US');
  return SOURCE_PROFILES.filter(
    (profile) => profile.enabled && profile.topics.includes(normalizedTopic),
  );
}

/** Compatibility lookup for pipeline v1 until source-centric scheduling replaces topic traversal. */
export function sourceProfile(topic: string): SourceProfile {
  const normalizedTopic = topic.trim().toLocaleLowerCase('en-US');
  return sourceProfileBySlug(TOPIC_SOURCE_SLUG[normalizedTopic] ?? '') ?? FALLBACK_PROFILE;
}
