# Localization failure taxonomy

Use one or more stable codes when recording a defect:

- `HALLUCINATED_CLAIM`: output adds an unsupported fact or conclusion.
- `MISSING_QUALIFIER`: output drops uncertainty, scope, timing, or conditions.
- `ATTRIBUTION_LOSS`: a party's claim becomes an unqualified fact.
- `NUMBER_CHANGED`: number, currency, unit, percentage, or date changes.
- `POLARITY_REVERSED`: negation, increase/decrease, comparison, or sentiment reverses.
- `ENTITY_CORRUPTED`: person, organization, product, ticker, or place changes.
- `STALE_SOURCE`: localization uses an obsolete source content hash.
- `LOCALE_FALLBACK_LEAK`: source-language text is served as the requested locale without marking fallback.
- `UNNATURAL_LOCALE`: meaning is faithful but terminology or grammar is unsuitable.
- `ACTION_OVERREACH`: suggested action becomes financial, medical, legal, or safety advice.
- `EVIDENCE_MISSING`: material claim has no exact source evidence span.
- `SCHEMA_INVALID`: structured output is incomplete or malformed.
- `INTERNAL_METADATA_LEAK`: a matching code, queue code, provider error, prompt
  identifier, or other implementation detail is rendered as user-visible copy.
- `PROVIDER_UNAVAILABLE`: the configured localization provider is missing credentials,
  rate-limited, timed out, or opened its circuit breaker; keep output unpublished.

For every confirmed defect, retain the source hash, bad output, expected behavior, code, prompt version, provider/model, and correction reason in a regression fixture or database evaluation record.
