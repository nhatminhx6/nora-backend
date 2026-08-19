# Content v2 admin operations

Content mutations are CLI/service-only; no unauthenticated production routes exist. Every mutation requires actor and reason and creates a `CONTENT_ADMIN_OPERATION` PipelineRun audit record.

Supported operations: pause/resume/inspect source health, bounded DLQ retry, raw replay, re-localize, rebuild clusters, retract/reject content, backfill audience matches, metrics snapshot, and v1/v2/shadow mode selection.

Pipeline mode changes return the exact environment variables to deploy and require a process restart. The v1 mode is the immediate kill switch and never rolls back or deletes v2 database records.
