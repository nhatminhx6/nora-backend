# Content v2 DLQ recovery

Inspect before retrying:

```bash
npm run content:dlq -- inspect --type=FETCH_SOURCE --error=HTTP_429 --limit=50
```

Retry is bounded and skips open/manual-paused source circuits:

```bash
npm run content:dlq -- retry --source=<source-uuid> --max=20
```

Validation/provenance/quality rejects require a reviewed policy deployment and the explicit `--policy-changed` flag. Never loop this command. Re-inspect the queue and source health after each bounded batch.
