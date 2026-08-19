import { Inject, Injectable } from '@nestjs/common';
import { ContentLocalizationStatus, Prisma } from '@prisma/client';
import { isKnownLocale } from '@nora/common';
import { PrismaService } from '@nora/database';
import { LocalizationV3Claim } from './localization-v3.contract';
import {
  LOCALIZATION_QUALITY_POLICY_V3,
  LOCALIZATION_SEMANTIC_VERIFIER,
  LocalizationSemanticVerifier,
} from './localization-quality-v3.contract';
import { LocalizationQualityV3Validator } from './localization-quality-v3.validator';

@Injectable()
export class LocalizationQualityV3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deterministic: LocalizationQualityV3Validator,
    @Inject(LOCALIZATION_SEMANTIC_VERIFIER) private readonly semantic: LocalizationSemanticVerifier,
  ) {}

  async verify(
    contentLocalizationId: string,
  ): Promise<{
    status: ContentLocalizationStatus;
    score: number;
    failureCodes: string[];
    highStakes: boolean;
  }> {
    const localization = await this.prisma.contentLocalization.findUniqueOrThrow({
      where: { id: contentLocalizationId },
      include: { canonicalContent: true },
    });
    const content = localization.canonicalContent;
    if (
      !localization.title ||
      !localization.summary ||
      !isKnownLocale(content.sourceLanguage) ||
      !isKnownLocale(localization.locale)
    )
      return this.persist(localization, false, 0, ['EMPTY_OUTPUT'], false, null);
    const claims = parseClaims(localization.claims);
    const glossary = await this.prisma.terminologyEntry.findMany({
      where: {
        sourceLanguage: content.sourceLanguage,
        targetLocale: localization.locale,
        version: localization.glossaryVersion,
        domain: { in: [...new Set([...content.topics, 'general-news', 'organization-product'])] },
      },
      select: { sourceTerm: true, preferredTerm: true, protected: true },
    });
    const input = {
      sourceTitle: content.originalTitle,
      sourceContent: content.originalContent ?? content.originalExcerpt ?? '',
      localizedTitle: localization.title,
      localizedSummary: localization.summary,
      localizedClaims: claims,
      sourceLanguage: content.sourceLanguage,
      targetLocale: localization.locale,
      glossary,
    } as const;
    const deterministic = this.deterministic.validate(input);
    const highStakes = isHighStakes(content.topics, content.metadata);
    if (!deterministic.passed)
      return this.persist(
        localization,
        false,
        deterministic.score,
        deterministic.failureCodes,
        highStakes,
        null,
      );
    let semantic;
    try {
      semantic = await this.semantic.verify({ ...input, highStakes });
    } catch {
      return this.persist(localization, false, 0, ['SEMANTIC_VERIFIER_FAILED'], highStakes, null);
    }
    const publish = semantic.passed && semantic.score >= 0.9;
    return this.persist(
      localization,
      publish,
      semantic.score,
      publish ? [] : ['SEMANTIC_VERIFIER_FAILED'],
      highStakes,
      semantic,
    );
  }

  private async persist(
    localization: {
      id: string;
      title: string | null;
      summary: string | null;
      claims: Prisma.JsonValue;
      provider: string | null;
      model: string | null;
      metadata: Prisma.JsonValue;
    },
    publish: boolean,
    score: number,
    failureCodes: readonly string[],
    highStakes: boolean,
    semantic: { provider: string; model: string; reasons: string[] } | null,
  ) {
    const status = publish
      ? ContentLocalizationStatus.VERIFIED
      : ContentLocalizationStatus.REJECTED;
    const metadata = {
      ...jsonRecord(localization.metadata),
      validator: LOCALIZATION_QUALITY_POLICY_V3,
      highStakes,
      semanticVerifier: semantic ?? { status: 'not-run' },
    };
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.contentLocalizationRevision.aggregate({
        where: { contentLocalizationId: localization.id },
        _max: { attemptNumber: true },
      });
      await tx.contentLocalizationRevision.create({
        data: {
          contentLocalizationId: localization.id,
          attemptNumber: (latest._max.attemptNumber ?? 0) + 1,
          title: localization.title,
          summary: localization.summary,
          claims: localization.claims as Prisma.InputJsonValue,
          status,
          qualityScore: score,
          failureCodes: [...failureCodes],
          evidence: [],
          provider: localization.provider,
          model: localization.model,
          correctionReason: publish ? null : failureCodes.join(',').slice(0, 120),
          metadata,
        },
      });
      await tx.contentLocalization.update({
        where: { id: localization.id },
        data: {
          status,
          qualityScore: score,
          failureCodes: [...failureCodes],
          verifiedAt: publish ? new Date() : null,
          metadata,
        },
      });
      return { status, score, failureCodes: [...failureCodes], highStakes };
    });
  }
}

function jsonRecord(value: Prisma.JsonValue): Prisma.InputJsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : {};
}

function parseClaims(value: Prisma.JsonValue): LocalizationV3Claim[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((claim) => {
    if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return [];
    const item = claim as Record<string, unknown>;
    if (
      typeof item.text !== 'string' ||
      !Array.isArray(item.evidence) ||
      item.evidence.some((span) => typeof span !== 'string')
    )
      return [];
    return [{ text: item.text, evidence: item.evidence as string[] }];
  });
}

function isHighStakes(topics: string[], metadata: Prisma.JsonValue): boolean {
  if (topics.some((topic) => /^(health|medicine|finance|economy|legal)$/iu.test(topic)))
    return true;
  return (
    !!metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).highImportance === true
  );
}
