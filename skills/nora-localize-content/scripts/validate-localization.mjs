#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const SUPPORTED_LOCALES = new Set(['vi', 'en']);
const PLACEHOLDER_HOSTS = new Set(['example.com', 'www.example.com', 'localhost', '127.0.0.1']);

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalized(value) {
  return String(value).normalize('NFKC').replaceAll(/\s+/g, ' ').trim().toLocaleLowerCase();
}

const inputPath = option('--input');
if (!inputPath) {
  console.error('Usage: validate-localization.mjs --input <json>');
  process.exit(2);
}

const document = JSON.parse(await readFile(inputPath, 'utf8'));
const errors = [];
const warnings = [];
const source = document.source ?? {};
const localization = document.localization ?? {};
const generation = document.generation ?? {};

for (const field of [
  'language',
  'publisher',
  'canonicalUrl',
  'publishedAt',
  'contentHash',
  'title',
  'content',
]) {
  if (!nonEmpty(source[field])) errors.push(`SOURCE_${field.toUpperCase()}_REQUIRED`);
}

try {
  const url = new URL(source.canonicalUrl);
  if (url.protocol !== 'https:') errors.push('SOURCE_URL_NOT_HTTPS');
  if (PLACEHOLDER_HOSTS.has(url.hostname)) errors.push('SOURCE_URL_PLACEHOLDER');
} catch {
  errors.push('SOURCE_URL_INVALID');
}

if (Number.isNaN(new Date(source.publishedAt).getTime()))
  errors.push('SOURCE_PUBLISHED_AT_INVALID');
if (!SUPPORTED_LOCALES.has(localization.locale)) errors.push('LOCALIZATION_LOCALE_UNSUPPORTED');
for (const field of ['title', 'summary', 'relevanceReason', 'suggestedAction']) {
  if (!nonEmpty(localization[field])) errors.push(`LOCALIZATION_${field.toUpperCase()}_REQUIRED`);
}
for (const field of ['provider', 'model', 'promptVersion', 'generatedAt']) {
  if (!nonEmpty(generation[field])) errors.push(`GENERATION_${field.toUpperCase()}_REQUIRED`);
}

const sourceCorpus = `${source.title ?? ''}\n${source.content ?? ''}`;
const outputCorpus = `${localization.title ?? ''}\n${localization.summary ?? ''}\n${localization.relevanceReason ?? ''}\n${localization.suggestedAction ?? ''}`;
const claims = Array.isArray(localization.claims) ? localization.claims : [];
if (claims.length === 0) errors.push('CLAIMS_REQUIRED');
for (const [claimIndex, claim] of claims.entries()) {
  if (!nonEmpty(claim?.text)) errors.push(`CLAIM_${claimIndex}_TEXT_REQUIRED`);
  const evidence = Array.isArray(claim?.evidence) ? claim.evidence : [];
  if (evidence.length === 0) errors.push(`CLAIM_${claimIndex}_EVIDENCE_REQUIRED`);
  for (const [evidenceIndex, span] of evidence.entries()) {
    if (!nonEmpty(span) || !sourceCorpus.includes(span)) {
      errors.push(`CLAIM_${claimIndex}_EVIDENCE_${evidenceIndex}_NOT_IN_SOURCE`);
    }
  }
}

const preservedValues = Array.isArray(document.preservedValues) ? document.preservedValues : [];
for (const value of preservedValues) {
  if (!normalized(sourceCorpus).includes(normalized(value)))
    errors.push(`PRESERVED_VALUE_NOT_IN_SOURCE:${value}`);
  if (!normalized(outputCorpus).includes(normalized(value)))
    errors.push(`PRESERVED_VALUE_NOT_IN_OUTPUT:${value}`);
}

const preservedTerms = Array.isArray(document.preservedTerms) ? document.preservedTerms : [];
for (const term of preservedTerms) {
  if (!nonEmpty(term?.source) || !normalized(sourceCorpus).includes(normalized(term.source))) {
    errors.push(`PRESERVED_TERM_NOT_IN_SOURCE:${term?.source ?? ''}`);
  }
  if (!nonEmpty(term?.target) || !normalized(outputCorpus).includes(normalized(term.target))) {
    errors.push(`PRESERVED_TERM_NOT_IN_OUTPUT:${term?.target ?? ''}`);
  }
}

if (
  document.attributionRequired === true &&
  !normalized(outputCorpus).includes(normalized(source.publisher))
) {
  errors.push('REQUIRED_ATTRIBUTION_MISSING');
}
if (
  nonEmpty(localization.suggestedAction) &&
  /\b(mua|bán|đầu tư ngay|buy|sell|diagnose|take medication)\b/iu.test(localization.suggestedAction)
) {
  errors.push('ACTION_OVERREACH');
}
if (nonEmpty(localization.summary) && localization.summary.length < 40)
  warnings.push('SUMMARY_TOO_SHORT_FOR_REVIEW');
if (nonEmpty(localization.summary) && localization.summary.length > 1_200)
  warnings.push('SUMMARY_TOO_LONG');

const qualityScore = Math.max(
  0,
  Number((1 - errors.length * 0.2 - warnings.length * 0.05).toFixed(2)),
);
const valid = errors.length === 0 && qualityScore >= 0.9;
console.log(
  JSON.stringify(
    {
      valid,
      qualityScore,
      errors,
      warnings,
      metrics: {
        claims: claims.length,
        evidenceSpans: claims.reduce(
          (total, claim) => total + (Array.isArray(claim?.evidence) ? claim.evidence.length : 0),
          0,
        ),
        preservedValues: preservedValues.length,
        preservedTerms: preservedTerms.length,
      },
    },
    null,
    2,
  ),
);
if (!valid) process.exitCode = 1;
