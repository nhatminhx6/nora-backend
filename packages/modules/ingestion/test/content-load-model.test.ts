import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { runLoadMatrix } from '../src/content-load-model';

test('load model keeps source/localization work independent from user count and matching batched', () => {
  const report = runLoadMatrix([1, 100, 1_000, 10_000]);
  assert.deepEqual(report.scenarios.map((item) => item.sourceRequests), [1, 1, 1, 1]);
  assert.deepEqual(report.scenarios.map((item) => item.localizationCalls), [2, 2, 2, 2]);
  assert.equal(report.scenarios.at(-1)!.matchingOperations, 10_000);
  assert.ok(report.scenarios.every((item) => item.queueDepthPeak <= 500));
  assert.deepEqual(report.comparison, { v1SourceRequestsAt10000: 10_000, v2SourceRequestsAt10000: 1 });
});
