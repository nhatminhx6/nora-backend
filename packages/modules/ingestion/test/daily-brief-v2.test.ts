import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { briefInputVersion } from '../src/daily-brief-v2.service';

test('brief input version is deterministic and changes with ranking or localization revision', () => {
  const base = [
    { id: 'b', score: 0.8, localizationUpdatedAt: new Date('2026-08-14T00:00:00Z') },
    { id: 'a', score: 0.9, localizationUpdatedAt: new Date('2026-08-14T00:00:00Z') },
  ];
  assert.equal(briefInputVersion(base), briefInputVersion([...base].reverse()));
  assert.notEqual(
    briefInputVersion(base),
    briefInputVersion([{ ...base[0]!, score: 0.7 }, base[1]!]),
  );
  assert.notEqual(
    briefInputVersion(base),
    briefInputVersion([
      { ...base[0]!, localizationUpdatedAt: new Date('2026-08-14T01:00:00Z') },
      base[1]!,
    ]),
  );
});
