import { KnownLocale } from './locale-registry';

export const KNOWN_MARKETS = ['VN', 'GLOBAL', 'US', 'CN'] as const;

export type Market = (typeof KNOWN_MARKETS)[number];

export type MarketParseResult =
  { ok: true; market: Market } | { ok: false; code: 'INVALID_MARKET'; input: string | null };

export interface MarketPreferences {
  homeMarket: Market;
  followedMarkets: Market[];
}

export type MarketPreferencesParseResult =
  | { ok: true; preferences: MarketPreferences }
  | { ok: false; code: 'INVALID_HOME_MARKET' | 'INVALID_FOLLOWED_MARKET'; input: string | null };

const KNOWN_MARKET_SET: ReadonlySet<string> = new Set(KNOWN_MARKETS);

export function isKnownMarket(value: unknown): value is Market {
  return typeof value === 'string' && KNOWN_MARKET_SET.has(value);
}

export function normalizeMarket(value: unknown): Market | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toUpperCase();
  return isKnownMarket(candidate) ? candidate : null;
}

export function parseMarket(value: unknown): MarketParseResult {
  const market = normalizeMarket(value);
  return market
    ? { ok: true, market }
    : { ok: false, code: 'INVALID_MARKET', input: typeof value === 'string' ? value : null };
}

export function parseMarketPreferences(input: {
  homeMarket: unknown;
  followedMarkets?: unknown;
}): MarketPreferencesParseResult {
  const homeMarket = normalizeMarket(input.homeMarket);
  if (!homeMarket) {
    return {
      ok: false,
      code: 'INVALID_HOME_MARKET',
      input: typeof input.homeMarket === 'string' ? input.homeMarket : null,
    };
  }

  const values = input.followedMarkets ?? [];
  if (!Array.isArray(values)) {
    return { ok: false, code: 'INVALID_FOLLOWED_MARKET', input: null };
  }

  const followedMarkets: Market[] = [];
  for (const value of values) {
    const market = normalizeMarket(value);
    if (!market) {
      return {
        ok: false,
        code: 'INVALID_FOLLOWED_MARKET',
        input: typeof value === 'string' ? value : null,
      };
    }
    if (market !== homeMarket && !followedMarkets.includes(market)) followedMarkets.push(market);
  }

  return { ok: true, preferences: { homeMarket, followedMarkets } };
}

export function defaultMarketPreferences(locale: KnownLocale): MarketPreferences {
  if (locale === 'vi') return { homeMarket: 'VN', followedMarkets: ['GLOBAL'] };
  if (locale === 'zh-Hans') return { homeMarket: 'CN', followedMarkets: ['GLOBAL'] };
  return { homeMarket: 'GLOBAL', followedMarkets: [] };
}
