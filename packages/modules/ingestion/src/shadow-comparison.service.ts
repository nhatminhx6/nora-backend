export interface ShadowFeedItem {
  id: string;
  url: string | null;
  publisher: string;
  publishedAt: Date;
  relevanceScore: number;
  localized: boolean;
  blockingLocalizationError: boolean;
  duplicateKey: string;
}

export interface ShadowMetrics {
  coverage: number;
  freshnessHours: number | null;
  duplicateRate: number;
  brokenUrlRate: number;
  localizationPassRate: number;
  relevance: number;
  sourceDiversity: number;
  requestUnits: number;
}

export interface ShadowComparisonReport {
  v1: ShadowMetrics;
  v2: ShadowMetrics;
  blockers: string[];
  decision: 'GO' | 'NO_GO';
}

export function compareShadowFeeds(
  v1Items: ShadowFeedItem[],
  v2Items: ShadowFeedItem[],
  now = new Date(),
): ShadowComparisonReport {
  const v1 = metrics(v1Items, now, v1Items.length);
  const v2 = metrics(v2Items, now, v2Items.length ? 1 : 0);
  const blockers: string[] = [];
  if (v2.brokenUrlRate > v1.brokenUrlRate) blockers.push('BROKEN_URL_RATE_INCREASED');
  if (v2.duplicateRate > v1.duplicateRate) blockers.push('DUPLICATE_RATE_INCREASED');
  if (v2Items.some((item) => item.blockingLocalizationError))
    blockers.push('BLOCKING_LOCALIZATION_ERROR_LEAKED');
  if (v2.coverage < Math.min(v1.coverage, 10)) blockers.push('VI_COVERAGE_INSUFFICIENT');
  if (v2Items.some((item) => !item.id)) blockers.push('PAGINATION_COMPATIBILITY_FAILED');
  return { v1, v2, blockers, decision: blockers.length ? 'NO_GO' : 'GO' };
}

function metrics(items: ShadowFeedItem[], now: Date, requestUnits: number): ShadowMetrics {
  const duplicateCount = items.length - new Set(items.map((item) => item.duplicateKey)).size;
  const localized = items.filter((item) => item.localized).length;
  const publishers = new Set(items.map((item) => item.publisher).filter(Boolean)).size;
  const freshest = items.reduce<Date | null>(
    (result, item) => (!result || item.publishedAt > result ? item.publishedAt : result),
    null,
  );
  return {
    coverage: items.length,
    freshnessHours: freshest
      ? Number(Math.max(0, (now.getTime() - freshest.getTime()) / 3_600_000).toFixed(2))
      : null,
    duplicateRate: ratio(duplicateCount, items.length),
    brokenUrlRate: ratio(items.filter((item) => !validHttpUrl(item.url)).length, items.length),
    localizationPassRate: ratio(localized, items.length),
    relevance: items.length
      ? Number((items.reduce((sum, item) => sum + item.relevanceScore, 0) / items.length).toFixed(4))
      : 0,
    sourceDiversity: ratio(publishers, items.length),
    requestUnits,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}
function validHttpUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
