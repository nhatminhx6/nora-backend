import { Inject, Injectable } from '@nestjs/common';
import { ContentLocalizationStatus, Prisma } from '@prisma/client';
import { KnownLocale, isKnownLocale } from '@nora/common';
import { PrismaService } from '@nora/database';
import { isLocalizationEligible } from './content-deduplication.service';
import { DeterministicClaimExtractorService } from './deterministic-claim-extractor.service';
import {
  LOCALIZATION_POLICY_V3,
  LOCALIZATION_V3_PROVIDER,
  LocalizationV3Output,
  LocalizationV3Provider,
  LocalizationV3Request,
  parseLocalizationV3Output,
} from './localization-v3.contract';

@Injectable()
export class LocalizationV3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: DeterministicClaimExtractorService,
    @Inject(LOCALIZATION_V3_PROVIDER) private readonly provider: LocalizationV3Provider,
  ) {}

  async generate(input: {
    canonicalContentId: string;
    targetLocale: KnownLocale;
    policyVersion?: string;
    glossaryVersion?: string;
  }): Promise<{ id: string; cached: boolean; output: LocalizationV3Output }> {
    const policyVersion = input.policyVersion ?? LOCALIZATION_POLICY_V3;
    const glossaryVersion = input.glossaryVersion ?? 'glossary-v1';
    const content = await this.prisma.canonicalContent.findUniqueOrThrow({
      where: { id: input.canonicalContentId },
      include: { claims: true },
    });
    if (!isLocalizationEligible(content)) throw new Error('CONTENT_NOT_LOCALIZATION_ELIGIBLE');
    if (!isKnownLocale(content.sourceLanguage)) throw new Error('SOURCE_LANGUAGE_INVALID');
    const identity = {
      canonicalContentId_locale_sourceContentHash_policyVersion_glossaryVersion: {
        canonicalContentId: content.id,
        locale: input.targetLocale,
        sourceContentHash: content.contentHash,
        policyVersion,
        glossaryVersion,
      },
    };
    const existing = await this.prisma.contentLocalization.findUnique({ where: identity });
    if (existing?.title && existing.summary) {
      return {
        id: existing.id,
        cached: true,
        output: persistedOutput(existing, content.sourceLanguage, input.targetLocale),
      };
    }

    const sourceContent = content.originalContent ?? content.originalExcerpt ?? '';
    const extraction = this.extractor.extract(`${content.originalTitle}\n${sourceContent}`);
    const glossaryEntries = await this.prisma.terminologyEntry.findMany({
      where: {
        sourceLanguage: content.sourceLanguage,
        targetLocale: input.targetLocale,
        version: glossaryVersion,
        domain: { in: [...new Set([...content.topics, 'general-news', 'organization-product'])] },
      },
      orderBy: [{ domain: 'asc' }, { normalizedSourceTerm: 'asc' }],
    });
    const matchedGlossary = glossaryEntries.filter((entry) =>
      `${content.originalTitle}\n${sourceContent}`
        .toLocaleLowerCase('en-US')
        .includes(entry.sourceTerm.toLocaleLowerCase('en-US')),
    );
    const request: LocalizationV3Request = {
      sourceTitle: content.originalTitle,
      sourceContent,
      sourceClaims: extraction.claims.map((claim) => ({
        text: claim.text,
        evidence: [claim.text],
      })),
      preservedValues: [
        ...new Set(
          extraction.claims.flatMap((claim) => [
            ...claim.facts.map((fact) => fact.raw),
            ...claim.directions,
            ...(claim.certainty ? [claim.certainty] : []),
            ...(claim.attribution ? [claim.attribution] : []),
          ]),
        ),
      ],
      preservedTerms: [
        ...new Set([
          ...extraction.claims.flatMap((claim) => claim.entities),
          ...matchedGlossary.filter((entry) => entry.protected).map((entry) => entry.sourceTerm),
        ]),
      ],
      glossary: matchedGlossary.map((entry) => ({
        sourceTerm: entry.sourceTerm,
        preferredTerm: entry.preferredTerm,
        protected: entry.protected,
      })),
      sourceLanguage: content.sourceLanguage,
      targetLocale: input.targetLocale,
      policyVersion,
      glossaryVersion,
    };
    const generated = await this.provider.generateLocalization(request);
    const output = parseLocalizationV3Output(generated.output, request);
    const stored = await this.prisma.contentLocalization.upsert({
      where: identity,
      update: {
        title: output.title,
        summary: output.summary,
        claims: output.claims as unknown as Prisma.InputJsonValue,
        status: ContentLocalizationStatus.PENDING,
        provider: generated.provider,
        model: generated.model,
        generatedAt: new Date(),
        failureCodes: [],
        metadata: localizationMetadata(output),
      },
      create: {
        canonicalContentId: content.id,
        locale: input.targetLocale,
        sourceContentHash: content.contentHash,
        policyVersion,
        glossaryVersion,
        title: output.title,
        summary: output.summary,
        claims: output.claims as unknown as Prisma.InputJsonValue,
        status: ContentLocalizationStatus.PENDING,
        provider: generated.provider,
        model: generated.model,
        generatedAt: new Date(),
        metadata: localizationMetadata(output),
      },
      select: { id: true },
    });
    return { id: stored.id, cached: false, output };
  }
}

function localizationMetadata(output: LocalizationV3Output): Prisma.InputJsonObject {
  return {
    preservedValues: output.preservedValues,
    preservedTerms: output.preservedTerms,
    sourceLanguage: output.sourceLanguage,
    targetLocale: output.targetLocale,
    schemaVersion: 3,
  };
}

function persistedOutput(
  value: {
    title: string | null;
    summary: string | null;
    claims: Prisma.JsonValue;
    metadata: Prisma.JsonValue;
  },
  sourceLanguage: KnownLocale,
  targetLocale: KnownLocale,
): LocalizationV3Output {
  const metadata = record(value.metadata);
  return {
    title: value.title!,
    summary: value.summary!,
    claims: Array.isArray(value.claims)
      ? (value.claims as unknown as LocalizationV3Output['claims'])
      : [],
    preservedValues: stringArray(metadata.preservedValues),
    preservedTerms: stringArray(metadata.preservedTerms),
    sourceLanguage,
    targetLocale,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
