import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkItemRecurrenceType } from '@prisma/client';
import { nextOccurrence, RecurrenceRule } from '../src/work-item-recurrence';

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    recurrenceType: WorkItemRecurrenceType.NONE,
    recurrenceInterval: 1,
    recurrenceWeekdays: [],
    recurrenceLunarDays: [],
    recurrenceTimezone: 'Asia/Ho_Chi_Minh',
    recurrenceUntil: new Date('2027-01-01T00:00:00Z'),
    ...overrides,
  };
}

test('calculates the next daily occurrence and respects the end date', () => {
  const current = new Date('2026-08-10T01:00:00Z');
  assert.equal(
    nextOccurrence(rule({ recurrenceType: WorkItemRecurrenceType.DAILY }), current, current)?.toISOString(),
    '2026-08-11T01:00:00.000Z',
  );
  assert.equal(nextOccurrence(rule({
    recurrenceType: WorkItemRecurrenceType.DAILY,
    recurrenceUntil: current,
  }), current, current), null);
});

test('calculates a selected weekly weekday', () => {
  const current = new Date('2026-08-10T01:00:00Z'); // Monday in Vietnam
  assert.equal(
    nextOccurrence(rule({
      recurrenceType: WorkItemRecurrenceType.WEEKLY,
      recurrenceWeekdays: [3],
    }), current, current)?.toISOString(),
    '2026-08-12T01:00:00.000Z',
  );
});

test('calculates Vietnamese lunar first and fifteenth days', () => {
  const beforeTet = new Date('2026-02-16T01:00:00Z');
  assert.equal(
    nextOccurrence(rule({
      recurrenceType: WorkItemRecurrenceType.LUNAR_MONTHLY,
      recurrenceLunarDays: [1, 15],
    }), beforeTet, beforeTet)?.toISOString(),
    '2026-02-17T01:00:00.000Z',
  );
  const afterTet = new Date('2026-02-17T01:00:00Z');
  assert.equal(
    nextOccurrence(rule({
      recurrenceType: WorkItemRecurrenceType.LUNAR_MONTHLY,
      recurrenceLunarDays: [1, 15],
    }), afterTet, afterTet)?.toISOString(),
    '2026-03-03T01:00:00.000Z',
  );
});
