# Localization contract

## Input and output

Use this JSON structure for generation and validation:

```json
{
  "source": {
    "language": "en",
    "publisher": "Publisher",
    "canonicalUrl": "https://publisher.example/article",
    "publishedAt": "2026-08-05T00:00:00.000Z",
    "contentHash": "sha256",
    "title": "Source title",
    "content": "Verified source content"
  },
  "localization": {
    "locale": "vi",
    "title": "Localized title",
    "summary": "Localized source-grounded summary",
    "relevanceReason": "Why this matters to the tracked topic",
    "suggestedAction": "Neutral action",
    "claims": [
      {
        "text": "Localized material claim",
        "evidence": ["Exact source span supporting the claim"]
      }
    ]
  },
  "preservedValues": ["64,000", "0.16%"],
  "preservedTerms": [{ "source": "OpenAI", "target": "OpenAI" }],
  "attributionRequired": true,
  "generation": {
    "provider": "provider-id",
    "model": "model-id",
    "promptVersion": "localization-v1",
    "generatedAt": "2026-08-05T00:00:00.000Z"
  }
}
```

## Generation rules

- Keep `title` factual and concise. Do not turn analysis into a confirmed event.
- Keep `summary` self-contained and source-faithful.
- Keep `relevanceReason` personal but factual; it may reference the tracked topic, not invent user preferences.
- Keep `suggestedAction` neutral: open source, review context, or continue tracking. Do not generate financial, medical, or legal directives.
- Include a claim for each material statement in the localized title and summary.
- Copy evidence spans exactly from `source.title` or `source.content`.
- Include every material number, currency, percentage, date, named entity, and product identifier in `preservedValues` or `preservedTerms` when it appears in localized output.

## Storage identity

Treat this tuple as the reusable generation identity:

```text
insightId + locale + sourceContentHash + promptVersion
```

Changing the source hash or prompt version creates a new evaluation candidate. Do not regenerate merely because another user receives the same insight.
