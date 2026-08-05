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
- Use BullMQ job identity `localize:{insightId}:{locale}:{sourceContentHash}:{promptVersion}`.
- Apply provider rate limits, retries with backoff, timeout, circuit breaker, and dead-letter inspection.
- Never publish fallback-original under a requested locale without an explicit fallback marker.
