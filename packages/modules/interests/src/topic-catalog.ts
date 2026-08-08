import { EntityType } from '@prisma/client';

export type SupportedLocale = 'vi' | 'en';

export const CATEGORY_LABELS: Record<string, Record<SupportedLocale, string>> = {
  investments: { vi: 'Đầu tư', en: 'Investments' },
  work: { vi: 'Công việc', en: 'Work' },
  sports: { vi: 'Thể thao', en: 'Sports' },
  entertainment: { vi: 'Giải trí', en: 'Entertainment' },
  travel: { vi: 'Du lịch', en: 'Travel' },
  purchases: { vi: 'Mua sắm', en: 'Purchases' },
  health: { vi: 'Sức khỏe', en: 'Health' },
  other: { vi: 'Khác', en: 'Other' },
};

export function categoryLabel(category: string, locale: SupportedLocale): string {
  return CATEGORY_LABELS[category]?.[locale] ?? category;
}

export interface TopicDefinition {
  key: string;
  type: EntityType;
  category: string;
  symbol: string;
  names: Record<SupportedLocale, string>;
  descriptions: Record<SupportedLocale, string>;
  refinementLabels: Record<SupportedLocale, string>;
  refinementPlaceholders: Record<SupportedLocale, string>;
}

export const TOPIC_CATALOG: TopicDefinition[] = [
  {
    key: 'travel',
    type: EntityType.TOPIC,
    category: 'travel',
    symbol: 'airplane',
    names: { vi: 'Du lịch', en: 'Travel' },
    descriptions: {
      vi: 'Điểm đến, visa, thời tiết và thay đổi hành trình.',
      en: 'Destinations, visas, weather and travel changes.',
    },
    refinementLabels: { vi: 'Địa điểm anh quan tâm', en: 'Places you care about' },
    refinementPlaceholders: { vi: 'Cửu Trại Câu, Thành Đô', en: 'Jiuzhaigou, Chengdu' },
  },
  {
    key: 'markets',
    type: EntityType.TOPIC,
    category: 'investments',
    symbol: 'chart.line.uptrend.xyaxis',
    names: { vi: 'Thị trường & đầu tư', en: 'Markets & investing' },
    descriptions: {
      vi: 'Cổ phiếu, vàng, crypto và các biến động quan trọng.',
      en: 'Stocks, gold, crypto and meaningful market moves.',
    },
    refinementLabels: { vi: 'Tài sản hoặc mã theo dõi', en: 'Assets or tickers to follow' },
    refinementPlaceholders: { vi: 'Vàng SJC, VN-Index, OCB', en: 'Gold, VN-Index, OCB' },
  },
  {
    key: 'technology',
    type: EntityType.TECHNOLOGY,
    category: 'work',
    symbol: 'cpu',
    names: { vi: 'Công nghệ', en: 'Technology' },
    descriptions: {
      vi: 'Sản phẩm, nền tảng và thay đổi kỹ thuật đáng chú ý.',
      en: 'Products, platforms and important technical changes.',
    },
    refinementLabels: { vi: 'Công nghệ cụ thể', en: 'Specific technologies' },
    refinementPlaceholders: { vi: 'SwiftUI, iOS, OpenAI', en: 'SwiftUI, iOS, OpenAI' },
  },
  {
    key: 'career',
    type: EntityType.JOB,
    category: 'work',
    symbol: 'briefcase',
    names: { vi: 'Sự nghiệp', en: 'Career' },
    descriptions: {
      vi: 'Ngành nghề, kỹ năng và cơ hội liên quan đến công việc.',
      en: 'Industries, skills and opportunities related to work.',
    },
    refinementLabels: { vi: 'Vai trò hoặc ngành nghề', en: 'Roles or industries' },
    refinementPlaceholders: { vi: 'iOS Developer, Fintech', en: 'iOS Developer, Fintech' },
  },
  {
    key: 'health',
    type: EntityType.TOPIC,
    category: 'health',
    symbol: 'heart',
    names: { vi: 'Sức khỏe', en: 'Health' },
    descriptions: {
      vi: 'Thông tin sức khỏe và thói quen mà anh chủ động theo dõi.',
      en: 'Health information and habits you choose to follow.',
    },
    refinementLabels: { vi: 'Mối quan tâm cụ thể', en: 'Specific areas' },
    refinementPlaceholders: {
      vi: 'Giấc ngủ, chạy bộ, dinh dưỡng',
      en: 'Sleep, running, nutrition',
    },
  },
  {
    key: 'sports',
    type: EntityType.SPORTS_TEAM,
    category: 'sports',
    symbol: 'sportscourt',
    names: { vi: 'Thể thao', en: 'Sports' },
    descriptions: { vi: 'Đội bóng, giải đấu và lịch thi đấu.', en: 'Teams, leagues and fixtures.' },
    refinementLabels: { vi: 'Đội hoặc giải đấu', en: 'Teams or leagues' },
    refinementPlaceholders: { vi: 'Manchester United, F1', en: 'Manchester United, F1' },
  },
  {
    key: 'entertainment',
    type: EntityType.MOVIE,
    category: 'entertainment',
    symbol: 'film',
    names: { vi: 'Giải trí', en: 'Entertainment' },
    descriptions: {
      vi: 'Phim, nghệ sĩ và nội dung sắp phát hành.',
      en: 'Films, artists and upcoming releases.',
    },
    refinementLabels: { vi: 'Nghệ sĩ hoặc nội dung', en: 'Artists or titles' },
    refinementPlaceholders: { vi: 'Sơn Tùng M-TP, Marvel', en: 'Taylor Swift, Marvel' },
  },
  {
    key: 'products',
    type: EntityType.PRODUCT,
    category: 'purchases',
    symbol: 'bag',
    names: { vi: 'Sản phẩm muốn mua', en: 'Products to buy' },
    descriptions: {
      vi: 'Giá, phiên bản mới và thay đổi đáng cân nhắc.',
      en: 'Prices, new versions and changes worth considering.',
    },
    refinementLabels: { vi: 'Sản phẩm cụ thể', en: 'Specific products' },
    refinementPlaceholders: { vi: 'iPhone, xe điện, máy ảnh', en: 'iPhone, EVs, cameras' },
  },
];

export function parseLocale(raw?: string): SupportedLocale {
  return raw === 'en' ? 'en' : 'vi';
}
