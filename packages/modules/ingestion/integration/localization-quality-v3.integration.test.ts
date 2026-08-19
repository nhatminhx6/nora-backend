import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  ContentLocalizationStatus,
  ContentProvenanceStatus,
  PrismaClient,
  SourceKind,
} from '@prisma/client';
import {
  LocalizationSemanticVerifier,
  SemanticVerificationRequest,
} from '../src/localization-quality-v3.contract';
import { LocalizationQualityV3Service } from '../src/localization-quality-v3.service';
import { LocalizationQualityV3Validator } from '../src/localization-quality-v3.validator';

const prisma = new PrismaClient();

class FixtureVerifier implements LocalizationSemanticVerifier {
  calls: SemanticVerificationRequest[] = [];
  constructor(
    private readonly passed: boolean,
    private readonly score: number,
  ) {}
  async verify(request: SemanticVerificationRequest) {
    this.calls.push(request);
    return {
      passed: this.passed,
      score: this.score,
      reasons: this.passed ? [] : ['meaning drift'],
      provider: 'fixture',
      model: 'fixture-verifier-v1',
    };
  }
}

test('publishes only after deterministic and semantic gates and audits every decision', async (context) => {
  const suffix = randomUUID().slice(0, 8);
  const source = await prisma.source.create({
    data: {
      name: `Quality ${suffix}`,
      slug: `quality-${suffix}`,
      kind: SourceKind.RSS,
      adapterKey: 'generic-rss-v2',
      defaultIntervalSec: 900,
    },
  });
  const content = await prisma.canonicalContent.create({
    data: {
      sourceId: source.id,
      canonicalUrl: `https://quality-${suffix}.test/article`,
      externalId: 'quality-article',
      contentHash: 'f'.repeat(64),
      originalTitle: 'OpenAI update',
      originalContent: 'According to OpenAI, GPT-5 may increase revenue by 25%.',
      sourceLanguage: 'en',
      publisher: 'OpenAI',
      publishedAt: new Date('2026-08-14T07:00:00Z'),
      provenanceStatus: ContentProvenanceStatus.VERIFIED,
      topics: ['finance'],
      sourceTier: 1,
      authorityScore: 1,
    },
  });
  context.after(async () => {
    await prisma.contentLocalization.deleteMany({ where: { canonicalContentId: content.id } });
    await prisma.canonicalContent.delete({ where: { id: content.id } });
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.$disconnect();
  });
  const base = {
    canonicalContentId: content.id,
    locale: 'vi',
    sourceContentHash: content.contentHash,
    glossaryVersion: 'glossary-v1',
    title: 'Cập nhật từ OpenAI',
    claims: [
      {
        text: 'GPT-5 có thể tăng doanh thu 25%.',
        evidence: ['According to OpenAI, GPT-5 may increase revenue by 25%.'],
      },
    ],
    status: ContentLocalizationStatus.PENDING,
    provider: 'fixture',
    model: 'fixture-v1',
  } as const;
  const good = await prisma.contentLocalization.create({
    data: {
      ...base,
      policyVersion: 'quality-good',
      summary: 'Theo OpenAI, GPT-5 có thể tăng doanh thu 25%.',
    },
  });
  const verifier = new FixtureVerifier(true, 0.96);
  const service = new LocalizationQualityV3Service(
    prisma as never,
    new LocalizationQualityV3Validator(),
    verifier,
  );
  const accepted = await service.verify(good.id);
  assert.equal(accepted.status, ContentLocalizationStatus.VERIFIED);
  assert.equal(accepted.highStakes, true);
  assert.equal(verifier.calls.length, 1);
  assert.equal(verifier.calls[0]!.highStakes, true);

  const bad = await prisma.contentLocalization.create({
    data: {
      ...base,
      policyVersion: 'quality-bad',
      summary: 'Theo OpenAI, GPT-5 có thể giảm doanh thu 30%.',
    },
  });
  const rejected = await service.verify(bad.id);
  assert.equal(rejected.status, ContentLocalizationStatus.REJECTED);
  assert.ok(rejected.failureCodes.includes('NUMBER_CHANGED'));
  assert.ok(rejected.failureCodes.includes('DIRECTION_REVERSED'));
  assert.equal(verifier.calls.length, 1);
  assert.equal(
    await prisma.contentLocalizationRevision.count({
      where: { contentLocalizationId: { in: [good.id, bad.id] } },
    }),
    2,
  );
});
