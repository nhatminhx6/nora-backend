import { ContentLanguage, KnownLocale } from './locale-registry';
import { Market } from './market-registry';

export type { ContentLanguage, KnownLocale, SupportedLocale } from './locale-registry';
export type { Market, MarketPreferences } from './market-registry';

export interface ContentPresentationContext {
  locale: KnownLocale;
  homeMarket: Market;
  followedMarkets: Market[];
}

export interface ContentOriginContext {
  sourceLanguage: ContentLanguage;
  markets: Market[];
}
