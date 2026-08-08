export interface SourceProfile {
  name: string;
  slug: string;
  feedUrl: string;
  adapterKey: string;
  sourceTier: 1 | 2;
  scopedToInterest: boolean;
  locale: 'vi' | 'en';
  country?: string;
}

const VNEXPRESS_FEEDS: Record<string, string> = {
  travel: 'https://vnexpress.net/rss/du-lich.rss',
  markets: 'https://vnexpress.net/rss/kinh-doanh.rss',
  technology: 'https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss',
  career: 'https://vnexpress.net/rss/giao-duc.rss',
  health: 'https://vnexpress.net/rss/suc-khoe.rss',
  sports: 'https://vnexpress.net/rss/the-thao.rss',
  entertainment: 'https://vnexpress.net/rss/giai-tri.rss',
  products: 'https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss',
};

const SPECIALIZED_PROFILES: Record<string, SourceProfile> = {
  openai: {
    name: 'OpenAI Newsroom',
    slug: 'openai-newsroom-rss',
    feedUrl: 'https://openai.com/news/rss.xml',
    adapterKey: 'openai-newsroom-rss',
    sourceTier: 1,
    scopedToInterest: true,
    locale: 'en',
  },
  apple: {
    name: 'Apple Newsroom',
    slug: 'apple-newsroom-rss',
    feedUrl: 'https://www.apple.com/newsroom/rss-feed.rss',
    adapterKey: 'apple-newsroom-rss',
    sourceTier: 1,
    scopedToInterest: true,
    locale: 'en',
  },
  bitcoin: {
    name: 'CoinDesk',
    slug: 'coindesk-rss',
    feedUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss',
    adapterKey: 'coindesk-rss',
    sourceTier: 2,
    scopedToInterest: false,
    locale: 'en',
  },
};

export function sourceProfile(topicKey: string): SourceProfile {
  const specialized = SPECIALIZED_PROFILES[topicKey];
  if (specialized) return specialized;
  return {
    name: `VnExpress · ${topicKey}`,
    slug: `vnexpress-${topicKey}`,
    feedUrl: VNEXPRESS_FEEDS[topicKey] ?? 'https://vnexpress.net/rss/tin-moi-nhat.rss',
    adapterKey: 'vnexpress-topic-rss',
    sourceTier: 2,
    scopedToInterest: false,
    locale: 'vi',
    country: 'VN',
  };
}
