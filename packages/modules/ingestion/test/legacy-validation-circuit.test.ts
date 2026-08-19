import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldOpenLegacyValidationCircuit } from '../src/ingestion.service';

test('legacy detail validation stops after three consecutive source access failures', () => {
  assert.equal(shouldOpenLegacyValidationCircuit(['HTTP_403'], 2), false);
  assert.equal(shouldOpenLegacyValidationCircuit(['HTTP_403'], 3), true);
  assert.equal(shouldOpenLegacyValidationCircuit(['HTTP_429'], 3), true);
  assert.equal(shouldOpenLegacyValidationCircuit(['FETCH_FAILED'], 3), true);
  assert.equal(shouldOpenLegacyValidationCircuit(['CONTENT_TOO_SHORT'], 3), false);
});
