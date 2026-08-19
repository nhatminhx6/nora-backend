import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountFeedV2Enabled, globalFeedV2Enabled } from '../src/content-rollout.service';

test('rollout requires both account flag and global kill switch', () => {
  assert.equal(accountFeedV2Enabled({ contentFeedVersion: 'v2' }), true);
  assert.equal(accountFeedV2Enabled({ contentFeedVersion: 'v1' }), false);
  assert.equal(globalFeedV2Enabled('true', 'production'), true);
  assert.equal(globalFeedV2Enabled('false', 'development'), false);
  assert.equal(globalFeedV2Enabled(undefined, 'production'), false);
});
