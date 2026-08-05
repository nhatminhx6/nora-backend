---
name: nora-localize-content
description: Translate, summarize, and quality-check source-grounded Nora content across locales while preserving facts, attribution, dates, figures, entities, and provenance. Use when Codex needs to create or revise insight localizations, translate English or other source articles into Vietnamese, produce multilingual daily-brief content, evaluate localization quality, investigate a mistranslation, or improve Nora's reusable localization workflow.
---

# Nora Content Localization

Create source-grounded localizations that can be reused across users. Never translate separately per user.

## Required workflow

1. Read `references/localization-contract.md` before generating output. Read `references/quality-policy.md` before approving or revising output.
2. Accept only verified source content with canonical URL, publisher, source language, publication timestamp, and content hash. Use `$nora-curate-data` first when provenance is incomplete.
3. Reuse an existing localization when `(insightId, locale, sourceContentHash, promptVersion)` is unchanged.
4. Produce the structured localization contract. Translate meaning rather than word order, but do not add facts, causes, advice, certainty, or conclusions absent from the source.
5. Preserve names, organizations, product names, dates, quantities, currencies, percentages, comparison direction, negation, uncertainty, and attribution.
6. For disputed, legal, medical, financial, or safety-sensitive content, attribute every material claim and avoid presenting one party's statement as established fact.
7. Attach evidence spans copied from the source to every material localized claim. Evidence is for validation and must not be shown as fabricated quotation in the user-facing summary.
8. Run `scripts/validate-localization.mjs --input <file>`. Do not publish on a non-zero exit code.
9. Perform a semantic second pass after deterministic validation: compare each localized claim with its evidence and check omitted qualifiers, reversed meaning, overstatement, and unnatural locale usage.
10. Store provider, model, prompt version, source content hash, generated timestamp, validation status, and quality score. Never label manual Codex curation as an automated backend provider.
11. Publish once per insight and locale, then reuse for every matched user.
12. Verify the authenticated Nora API response for the requested locale and ensure fallback content is explicitly observable in metadata.

## Continuous improvement

- When a localization defect is found, classify it using `references/failure-taxonomy.md`.
- Add a minimal anonymized regression fixture for every reproducible defect before changing a validator rule or prompt contract.
- Prefer deterministic validation rules for numbers, URLs, required terms, evidence, locale, and schema. Keep semantic judgment in the model review step.
- Update this skill, its references, validator, and prompt version together when behavior changes.
- Keep repository history as the change log; do not create a separate changelog file.
- Never silently overwrite an approved localization. Retain the previous provider, prompt version, content hash, quality result, and correction reason.

## Validation command

```bash
node skills/nora-localize-content/scripts/validate-localization.mjs --input /path/to/localization.json
```

Require `valid: true` and `qualityScore >= 0.9` for normal content. Require semantic review in addition to the score for high-stakes content.
