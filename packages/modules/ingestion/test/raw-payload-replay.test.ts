import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReplayArgs } from '../src/raw-payload-replay.service';

test('replay requires actor/version and parses source/date dry-run filters', () => {
  assert.throws(() => parseReplayArgs(['--version=v2']), /REPLAY_ACTOR_REQUIRED/);
  assert.throws(() => parseReplayArgs(['--actor=ops']), /REPLAY_VERSION_REQUIRED/);
  const result = parseReplayArgs([
    '--dry-run',
    '--actor=ops',
    '--version=parser-v3',
    '--source=source-id',
    '--from=2026-08-01',
    '--limit=50',
  ]);
  assert.equal(result.dryRun, true);
  assert.equal(result.actor, 'ops');
  assert.equal(result.sourceId, 'source-id');
  assert.equal(result.limit, 50);
  assert.equal(result.from?.toISOString(), '2026-08-01T00:00:00.000Z');
});
