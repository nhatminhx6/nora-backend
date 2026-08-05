#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const PLACEHOLDER_HOSTS = new Set(['example.com', 'www.example.com', 'localhost', '127.0.0.1']);

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputPath = option('--input');
const maxAgeDays = Number(option('--max-age-days') ?? 7);
const allowOlder = process.argv.includes('--allow-older');

if (!inputPath) {
  console.error('Usage: verify-source-urls.mjs --input <json> [--max-age-days 7] [--allow-older]');
  process.exit(2);
}

const candidates = JSON.parse(await readFile(inputPath, 'utf8'));
if (!Array.isArray(candidates)) {
  throw new Error('Input must be a JSON array');
}

const results = [];
for (const candidate of candidates) {
  const errors = [];
  let finalUrl = null;
  let status = null;
  try {
    const parsed = new URL(candidate.url);
    if (parsed.protocol !== 'https:') errors.push('URL_NOT_HTTPS');
    if (PLACEHOLDER_HOSTS.has(parsed.hostname)) errors.push('PLACEHOLDER_HOST');
    if (parsed.pathname === '/' || parsed.pathname.length < 5) errors.push('NOT_ARTICLE_PATH');

    const response = await fetch(parsed, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9',
        'User-Agent': 'NoraDataQuality/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    });
    status = response.status;
    finalUrl = response.url;
    if (!response.ok) errors.push(`HTTP_${response.status}`);
    const finalHost = new URL(finalUrl).hostname;
    if (
      candidate.expectedDomain &&
      finalHost !== candidate.expectedDomain &&
      !finalHost.endsWith(`.${candidate.expectedDomain}`)
    ) {
      errors.push('UNEXPECTED_FINAL_DOMAIN');
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/json')) {
      errors.push('UNEXPECTED_CONTENT_TYPE');
    }
  } catch (error) {
    errors.push(error instanceof Error ? `FETCH_FAILED:${error.message}` : 'FETCH_FAILED');
  }

  if (candidate.publishedAt && !allowOlder) {
    const publishedAt = new Date(candidate.publishedAt);
    const ageMs = Date.now() - publishedAt.getTime();
    if (Number.isNaN(publishedAt.getTime())) errors.push('INVALID_PUBLISHED_AT');
    else if (ageMs > maxAgeDays * 86_400_000) errors.push('OUTSIDE_FRESHNESS_WINDOW');
  }

  results.push({ url: candidate.url, finalUrl, status, valid: errors.length === 0, errors });
}

console.log(
  JSON.stringify(
    { checked: results.length, valid: results.filter((item) => item.valid).length, results },
    null,
    2,
  ),
);
if (results.some((item) => !item.valid)) process.exitCode = 1;
