import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBackfillArgs } from '../src/legacy-content-backfill.service';

test('backfill args support dry-run, bounded batches and resumable cursor', () => {
  assert.deepEqual(parseBackfillArgs(['--dry-run', '--batch-size=25', '--cursor=abc']), {
    dryRun: true,
    batchSize: 25,
    cursor: 'abc',
  });
  assert.throws(() => parseBackfillArgs(['--batch-size=0']), /BACKFILL_BATCH_SIZE_INVALID/);
  assert.throws(() => parseBackfillArgs(['--batch-size=1001']), /BACKFILL_BATCH_SIZE_INVALID/);
});
