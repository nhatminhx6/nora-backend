import { PrismaClient } from '@prisma/client';
import { compareShadowFeeds, ShadowFeedItem } from '../src/shadow-comparison.service';

async function main() {
  const email = argument('--user=');
  if (!email) throw new Error('SHADOW_USER_REQUIRED');
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('SHADOW_USER_NOT_FOUND');
    const legacy = await prisma.userInsight.findMany({
      where: { userId: user.id },
      include: {
        insight: { include: { localizations: true, insightEvents: { include: { event: { include: { source: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const eventIds = new Set(
      legacy.flatMap((entry) => entry.insight.insightEvents.map((link) => link.eventId)),
    );
    const canonical = await prisma.canonicalContent.findMany({
      where: { provenanceStatus: 'VERIFIED', duplicateOfId: null },
      include: { localizations: { where: { locale: 'vi' } } },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
    });
    const v1: ShadowFeedItem[] = legacy.map((entry) => {
      const event = entry.insight.insightEvents[0]?.event;
      const localization = entry.insight.localizations.find((item) => item.locale === 'vi');
      return {
        id: entry.id,
        url: event?.url ?? null,
        publisher: event?.source.name ?? '',
        publishedAt: event?.publishedAt ?? entry.createdAt,
        relevanceScore: Number(entry.relevanceScore),
        localized: localization?.validationStatus === 'PASSED',
        blockingLocalizationError: false,
        duplicateKey: event?.contentHash ?? entry.insightId,
      };
    });
    const v2: ShadowFeedItem[] = canonical
      .filter((content) => eventIds.has(metadataString(content.metadata, 'legacyEventId')))
      .filter((content) => content.localizations.some((item) => item.status === 'VERIFIED'))
      .map((content) => {
        const verified = content.localizations.some((item) => item.status === 'VERIFIED');
        return {
          id: content.id,
          url: content.canonicalUrl,
          publisher: content.publisher,
          publishedAt: content.publishedAt,
          relevanceScore: Number(content.authorityScore),
          localized: verified,
          blockingLocalizationError: content.localizations.some(
            (item) => item.status !== 'VERIFIED' && item.failureCodes.length === 0,
          ),
          duplicateKey: content.contentHash,
        };
      });
    process.stdout.write(`${JSON.stringify({ user: email, ...compareShadowFeeds(v1, v2) }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

function argument(prefix: string): string | undefined {
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
function metadataString(value: unknown, key: string): string {
  return value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>)[key] === 'string'
    ? ((value as Record<string, unknown>)[key] as string)
    : '';
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'SHADOW_REPORT_FAILED'}\n`);
  process.exitCode = 1;
});
