import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { pipelineEnv } from '../src/content-operations.service';

test('pipeline toggle always provides reversible v1/v2/shadow env without DB rollback', () => {
  assert.equal(pipelineEnv('v1').CONTENT_PIPELINE_V1_ENABLED, 'true');
  assert.equal(pipelineEnv('v2').CONTENT_PIPELINE_V2_ENABLED, 'true');
  assert.equal(pipelineEnv('shadow').CONTENT_PIPELINE_V2_SHADOW, 'true');
  assert.equal(pipelineEnv('v1').restartRequired, true);
});
