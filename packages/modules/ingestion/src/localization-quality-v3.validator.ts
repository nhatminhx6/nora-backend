import { Injectable } from '@nestjs/common';
import {
  extractDirections,
  extractEntities,
  extractFacts,
} from './deterministic-claim-extractor.service';
import {
  LocalizationBlockingError,
  LocalizationQualityV3Input,
} from './localization-quality-v3.contract';

@Injectable()
export class LocalizationQualityV3Validator {
  validate(input: LocalizationQualityV3Input): {
    passed: boolean;
    score: number;
    failureCodes: LocalizationBlockingError[];
  } {
    const failures = new Set<LocalizationBlockingError>();
    const source = `${input.sourceTitle}\n${input.sourceContent}`;
    const localized = `${input.localizedTitle}\n${input.localizedSummary}\n${input.localizedClaims.map((claim) => claim.text).join('\n')}`;
    if (
      !input.localizedTitle.trim() ||
      !input.localizedSummary.trim() ||
      input.localizedClaims.length === 0
    )
      failures.add('EMPTY_OUTPUT');

    const sourceFacts = extractFacts(source);
    const localizedFacts = extractFacts(localized);
    compareFacts('NUMBER', 'NUMBER_CHANGED', sourceFacts, localizedFacts, failures);
    compareFacts('PRODUCT_VERSION', 'NUMBER_CHANGED', sourceFacts, localizedFacts, failures);
    compareFacts('PERCENTAGE', 'NUMBER_CHANGED', sourceFacts, localizedFacts, failures);
    compareFacts('CURRENCY', 'CURRENCY_CHANGED', sourceFacts, localizedFacts, failures);
    compareFacts('DATE_TIME', 'DATE_CHANGED', sourceFacts, localizedFacts, failures);

    for (const entity of extractEntities(source)) {
      if (!includesFolded(localized, entity)) failures.add('ENTITY_CORRUPTED');
    }
    const sourceDirections = new Set(extractDirections(source).map(directionConcept));
    const localizedDirections = new Set(extractDirections(localized).map(directionConcept));
    if (!sameSet(sourceDirections, localizedDirections)) failures.add('DIRECTION_REVERSED');

    const sourceCertainty = certaintyConcepts(source);
    const localizedCertainty = certaintyConcepts(localized);
    if (!sameSet(sourceCertainty, localizedCertainty)) failures.add('CERTAINTY_CHANGED');

    for (const attribution of attributions(source)) {
      if (!includesFolded(localized, attribution)) failures.add('ATTRIBUTION_DROPPED');
    }
    if (input.localizedClaims.some((claim) => claim.evidence.length === 0))
      failures.add('MISSING_EVIDENCE');
    if (
      input.localizedClaims
        .flatMap((claim) => claim.evidence)
        .some((span) => !source.includes(span))
    )
      failures.add('EVIDENCE_NOT_IN_SOURCE');
    if (
      input.sourceLanguage !== input.targetLocale &&
      includesFolded(localized, input.sourceTitle) &&
      includesFolded(localized, input.sourceContent)
    )
      failures.add('LOCALE_FALLBACK_LEAK');
    if (input.targetLocale === 'vi' && englishLeakRatio(localized) > 0.82)
      failures.add('LOCALE_FALLBACK_LEAK');
    for (const term of input.glossary) {
      if (!includesFolded(source, term.sourceTerm)) continue;
      const expected = term.protected ? term.sourceTerm : term.preferredTerm;
      if (!includesFolded(localized, expected)) failures.add('GLOSSARY_VIOLATION');
    }
    return {
      passed: failures.size === 0,
      score: Math.max(0, 1 - failures.size * 0.25),
      failureCodes: [...failures],
    };
  }
}

function compareFacts(
  kind: string,
  code: LocalizationBlockingError,
  source: ReturnType<typeof extractFacts>,
  localized: ReturnType<typeof extractFacts>,
  failures: Set<LocalizationBlockingError>,
) {
  const expected = source.filter((fact) => fact.kind === kind).map((fact) => fact.normalized);
  const actual = new Set(
    localized.filter((fact) => fact.kind === kind).map((fact) => fact.normalized),
  );
  const expectedSet = new Set(expected);
  if (
    expected.some((value) => !actual.has(value)) ||
    [...actual].some((value) => !expectedSet.has(value))
  )
    failures.add(code);
}

function directionConcept(value: string): string {
  if (/^(tăng|rise|rises|rose|increase|increased)$/iu.test(value)) return 'UP';
  if (/^(giảm|fall|falls|fell|decrease|decreased)$/iu.test(value)) return 'DOWN';
  return 'UNCHANGED';
}

function certaintyConcepts(value: string): Set<string> {
  const concepts = new Set<string>();
  if (/(?<!\p{L})(?:may|might|could|dự kiến|có thể)(?!\p{L})/iu.test(value))
    concepts.add('POSSIBLE');
  if (/(?<!\p{L})(?:likely|nhiều khả năng)(?!\p{L})/iu.test(value)) concepts.add('LIKELY');
  if (/(?<!\p{L})(?:unlikely|khó có khả năng)(?!\p{L})/iu.test(value)) concepts.add('UNLIKELY');
  if (/(?<!\p{L})(?:confirmed|xác nhận)(?!\p{L})/iu.test(value)) concepts.add('CONFIRMED');
  return concepts;
}

function attributions(value: string): string[] {
  return [...value.matchAll(/(?:according to|theo)\s+([^,.;:\n]{2,120})/giu)].map((match) =>
    match[1]!.trim(),
  );
}

function includesFolded(value: string, expected: string): boolean {
  return normalize(value).includes(normalize(expected));
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
}
function englishLeakRatio(value: string): number {
  const words = value.match(/[A-Za-zÀ-ỹ]+/gu) ?? [];
  if (words.length < 8) return 0;
  const markers = new Set([
    'the',
    'and',
    'as',
    'while',
    'with',
    'from',
    'this',
    'that',
    'was',
    'were',
    'has',
    'have',
    'after',
    'before',
    'fell',
    'falls',
    'rose',
    'rises',
    'remained',
    'stable',
  ]);
  return (
    words.filter((word) => markers.has(word.toLowerCase())).length / Math.max(1, words.length / 8)
  );
}
