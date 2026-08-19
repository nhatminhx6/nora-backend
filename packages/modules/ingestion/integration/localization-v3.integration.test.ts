import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  ContentLocalizationStatus,
  ContentProvenanceStatus,
  PrismaClient,
  SourceKind,
} from '@prisma/client';
import { DeterministicClaimExtractorService } from '../src/deterministic-claim-extractor.service';
import {
  LocalizationV3Provider,
  LocalizationV3ProviderResult,
  LocalizationV3Request,
} from '../src/localization-v3.contract';
import { LocalizationV3Service } from '../src/localization-v3.service';
import { TerminologyGlossaryService } from '../src/terminology-glossary.service';

const prisma = new PrismaClient();

class FixtureProvider implements LocalizationV3Provider {
  calls = 0;

  async generateLocalization(
    request: LocalizationV3Request,
  ): Promise<LocalizationV3ProviderResult> {
    this.calls += 1;
    return {
      provider: 'fixture',
      model: 'fixture-v1',
      output: {
        title: 'OpenAI ra mắt GPT-5',
        summary: 'OpenAI cho biết GPT-5 có thể tăng thông lượng thêm 25%.',
        claims: [
          {
            text: 'GPT-5 có thể tăng thông lượng thêm 25%.',
            evidence: [request.sourceClaims.at(-1)!.evidence[0]],
          },
        ],
        preservedValues: request.preservedValues,
        preservedTerms: request.preservedTerms,
        sourceLanguage: request.sourceLanguage,
        targetLocale: request.targetLocale,
      },
    };
  }
}

test('validated localization persists once for the reusable identity', async (context) => {
  const suffix = randomUUID().slice(0, 8);
  const source = await prisma.source.create({
    data: {
      name: `Localization ${suffix}`,
      slug: `localization-${suffix}`,
      kind: SourceKind.RSS,
      adapterKey: 'generic-rss-v2',
      defaultIntervalSec: 900,
    },
  });
  const content = await prisma.canonicalContent.create({
    data: {
      sourceId: source.id,
      canonicalUrl: `https://localization-${suffix}.test/article`,
      externalId: 'localization-article',
      contentHash: 'e'.repeat(64),
      originalTitle: 'OpenAI launches GPT-5',
      originalContent: 'OpenAI said GPT-5 may increase throughput by 25%.',
      sourceLanguage: 'en',
      publisher: 'OpenAI',
      publishedAt: new Date('2026-08-14T07:00:00Z'),
      provenanceStatus: ContentProvenanceStatus.VERIFIED,
      topics: ['technology'],
      sourceTier: 1,
      authorityScore: 1,
    },
  });
  context.after(async () => {
    await prisma.contentLocalization.deleteMany({ where: { canonicalContentId: content.id } });
    await prisma.canonicalContent.delete({ where: { id: content.id } });
    await prisma.terminologyEntry.deleteMany({ where: { version: 'glossary-v1' } });
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.$disconnect();
  });
  await new TerminologyGlossaryService(prisma as never).seedV1();
  const provider = new FixtureProvider();
  const service = new LocalizationV3Service(
    prisma as never,
    new DeterministicClaimExtractorService(),
    provider,
  );
  const first = await service.generate({ canonicalContentId: content.id, targetLocale: 'vi' });
  const second = await service.generate({ canonicalContentId: content.id, targetLocale: 'vi' });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.id, first.id);
  assert.equal(provider.calls, 1);
  const stored = await prisma.contentLocalization.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(stored.status, ContentLocalizationStatus.PENDING);
  assert.equal(stored.provider, 'fixture');
  assert.equal(stored.title, 'OpenAI ra mắt GPT-5');
});
