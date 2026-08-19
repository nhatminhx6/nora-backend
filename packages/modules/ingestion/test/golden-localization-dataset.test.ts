import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalizationQualityV3Validator } from '../src/localization-quality-v3.validator';
import { GOLDEN_LOCALIZATION_DATASET_V1, qualityInput } from './fixtures/golden-localization-v1';

const validator = new LocalizationQualityV3Validator();

test('golden dataset has 100 unique fixtures with the required category distribution', () => {
  assert.equal(GOLDEN_LOCALIZATION_DATASET_V1.length, 100);
  assert.equal(new Set(GOLDEN_LOCALIZATION_DATASET_V1.map((fixture) => fixture.id)).size, 100);
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(GOLDEN_LOCALIZATION_DATASET_V1.map((fixture) => fixture.category))].map(
        (category) => [
          category,
          GOLDEN_LOCALIZATION_DATASET_V1.filter((fixture) => fixture.category === category).length,
        ],
      ),
    ),
    {
      'technology-global': 25,
      'economy-finance': 25,
      health: 15,
      'vietnamese-source': 15,
      adversarial: 20,
    },
  );
});

test('every fixture carries reviewable preservation, terminology and forbidden transformations', () => {
  for (const fixture of GOLDEN_LOCALIZATION_DATASET_V1) {
    assert.ok(fixture.expectedPreservation.length > 0, fixture.id);
    assert.ok(fixture.acceptableTerms.length > 0, fixture.id);
    assert.ok(fixture.forbiddenTransformations.length > 0, fixture.id);
    assert.ok(
      fixture.candidate.claims.every((claim) =>
        claim.evidence.every((span) => fixture.source.content.includes(span)),
      ),
      fixture.id,
    );
  }
});

test('80 acceptable localizations pass deterministic quality gate without exact wording matching', () => {
  for (const fixture of GOLDEN_LOCALIZATION_DATASET_V1.filter(
    (item) => item.category !== 'adversarial',
  )) {
    const result = validator.validate(qualityInput(fixture));
    assert.deepEqual(result.failureCodes, [], `${fixture.id}: ${result.failureCodes.join(',')}`);
  }
});

test('adversarial deterministic mutations are blocked and causality drift is routed to semantic rejection', () => {
  const adversarial = GOLDEN_LOCALIZATION_DATASET_V1.filter(
    (item) => item.category === 'adversarial',
  );
  for (const fixture of adversarial) {
    const result = validator.validate(qualityInput(fixture));
    for (const code of fixture.expectedBlockingCodes)
      assert.ok(result.failureCodes.includes(code), `${fixture.id}: missing ${code}`);
    if (fixture.semanticMustReject) assert.deepEqual(result.failureCodes, [], fixture.id);
    else assert.ok(result.failureCodes.length > 0, fixture.id);
  }
  assert.ok(adversarial.some((fixture) => fixture.semanticMustReject));
});
