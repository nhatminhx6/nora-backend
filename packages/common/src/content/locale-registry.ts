export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export const KNOWN_LOCALES = ['vi', 'en', 'zh-Hans'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type KnownLocale = (typeof KNOWN_LOCALES)[number];
export type ContentLanguage = KnownLocale;

export type LocaleParseResult =
  | { ok: true; locale: KnownLocale; enabled: true }
  | { ok: false; code: 'LOCALE_DISABLED'; locale: KnownLocale; enabled: false }
  | { ok: false; code: 'INVALID_LOCALE'; input: string | null };

export interface LocaleFeatureFlags {
  zhHansEnabled?: boolean;
}

const KNOWN_LOCALE_SET: ReadonlySet<string> = new Set(KNOWN_LOCALES);
const SUPPORTED_LOCALE_SET: ReadonlySet<string> = new Set(SUPPORTED_LOCALES);

export function isKnownLocale(value: unknown): value is KnownLocale {
  return typeof value === 'string' && KNOWN_LOCALE_SET.has(value);
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALE_SET.has(value);
}

export function normalizeLocale(value: unknown): KnownLocale | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().replaceAll('_', '-');
  if (!candidate) return null;

  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(candidate)[0] ?? '';
  } catch {
    return null;
  }

  const locale = new Intl.Locale(canonical);
  if (locale.language === 'vi') return 'vi';
  if (locale.language === 'en') return 'en';
  if (
    locale.language === 'zh' &&
    (locale.script === 'Hans' || locale.region === 'CN' || locale.region === 'SG')
  ) {
    return 'zh-Hans';
  }
  return null;
}

export function parseLocale(
  value: unknown,
  featureFlags: LocaleFeatureFlags = {},
): LocaleParseResult {
  const locale = normalizeLocale(value);
  if (!locale) {
    return { ok: false, code: 'INVALID_LOCALE', input: typeof value === 'string' ? value : null };
  }
  if (locale === 'zh-Hans' && featureFlags.zhHansEnabled !== true) {
    return { ok: false, code: 'LOCALE_DISABLED', locale, enabled: false };
  }
  return { ok: true, locale, enabled: true };
}
