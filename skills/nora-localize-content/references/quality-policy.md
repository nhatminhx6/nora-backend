# Localization quality policy

## Approval gates

1. Schema gate: required fields and supported locale exist.
2. Provenance gate: canonical HTTPS URL, publisher, timestamp, and content hash exist.
3. Evidence gate: every material claim has at least one exact span in the source.
4. Fidelity gate: no changed number, polarity, attribution, certainty, causal claim, or comparison direction.
5. Locale gate: text is natural for the requested locale and does not expose raw fallback text unintentionally.
6. Safety gate: high-stakes statements remain attributed and contain no generated professional directive.

## Scoring

- Start at 1.0.
- Any blocking schema, provenance, missing-evidence, or preservation error makes the result invalid.
- Deduct 0.05 per non-blocking warning.
- Require at least 0.90 for publication.
- A passing numeric score never replaces semantic review for legal, medical, financial, safety, or disputed content.

## Model usage at scale

- Generate once per unique source content hash and locale.
- Prefer a lower-cost capable model for ordinary translation.
- Route high-importance or high-stakes content to a stronger model and an independent verifier pass.
- Use logical job identity `localize:{insightId}:{locale}:{sourceContentHash}:{promptVersion}`.
  Encode separators as hyphens in BullMQ custom job IDs because BullMQ reserves colons.
- Apply provider rate limits, retries with backoff, timeout, circuit breaker, and dead-letter inspection.
- Never publish fallback-original under a requested locale without an explicit fallback marker.
- API responses that use source-language content because a requested localization
  is unavailable must expose `requestedLocale`, `servedLocale`, and `fallback: true`.
- Treat provider `HTTP 429` as retryable with bounded exponential backoff and
  rate limiting; after retries, keep the localization unpublished rather than
  serving it under the requested locale label.
- Failed localization must create a delayed retry job independent of source
  crawling. Internal matching codes such as `RSS_TERM_MATCH` are metadata and
  must be converted to locale-appropriate user copy at the API boundary.
- Localization retry backoff must be longer than the provider circuit-breaker
  window so attempts are not exhausted while the circuit is still open.
