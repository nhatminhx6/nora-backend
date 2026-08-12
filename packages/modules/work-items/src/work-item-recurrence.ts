import { BadRequestException } from '@nestjs/common';
import { WorkItem, WorkItemRecurrenceType } from '@prisma/client';

export type RecurrenceRule = Pick<
  WorkItem,
  | 'recurrenceType'
  | 'recurrenceInterval'
  | 'recurrenceWeekdays'
  | 'recurrenceLunarDays'
  | 'recurrenceTimezone'
  | 'recurrenceUntil'
>;

const weekdayNumbers: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

export function validateRecurrence(rule: RecurrenceRule): void {
  if (rule.recurrenceType !== WorkItemRecurrenceType.NONE && !rule.recurrenceUntil) {
    throw new BadRequestException({ code: 'RECURRENCE_END_REQUIRED', message: 'A recurrence end date is required' });
  }
  if (rule.recurrenceType === WorkItemRecurrenceType.WEEKLY && rule.recurrenceWeekdays.length === 0) {
    throw new BadRequestException({ code: 'RECURRENCE_WEEKDAY_REQUIRED', message: 'Choose at least one weekday' });
  }
  if (rule.recurrenceType === WorkItemRecurrenceType.LUNAR_MONTHLY && rule.recurrenceLunarDays.length === 0) {
    throw new BadRequestException({ code: 'RECURRENCE_LUNAR_DAY_REQUIRED', message: 'Choose at least one lunar day' });
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: rule.recurrenceTimezone }).format(new Date());
  } catch {
    throw new BadRequestException({ code: 'INVALID_TIMEZONE', message: 'Recurrence timezone is invalid' });
  }
}

export function nextOccurrence(rule: RecurrenceRule, after: Date, preferredTime: Date): Date | null {
  if (rule.recurrenceType === WorkItemRecurrenceType.NONE) return null;
  if (rule.recurrenceType === WorkItemRecurrenceType.DAILY) {
    const result = new Date(after);
    result.setUTCDate(result.getUTCDate() + rule.recurrenceInterval);
    return isWithinRange(result, rule.recurrenceUntil) ? result : null;
  }

  const candidate = new Date(after);
  candidate.setUTCHours(
    preferredTime.getUTCHours(), preferredTime.getUTCMinutes(), preferredTime.getUTCSeconds(), 0,
  );
  if (candidate <= after) candidate.setUTCDate(candidate.getUTCDate() + 1);

  // 400 days covers a full lunar year and any weekly rule with ample margin.
  for (let offset = 0; offset < 400; offset += 1) {
    if (rule.recurrenceType === WorkItemRecurrenceType.WEEKLY) {
      const weekday = weekdayNumbers[new Intl.DateTimeFormat('en-US', {
        weekday: 'short', timeZone: rule.recurrenceTimezone,
      }).format(candidate)];
      if (weekday && rule.recurrenceWeekdays.includes(weekday)) {
        return isWithinRange(candidate, rule.recurrenceUntil) ? candidate : null;
      }
    } else if (rule.recurrenceType === WorkItemRecurrenceType.LUNAR_MONTHLY) {
      const lunarDayValue = lunarDay(candidate, rule.recurrenceTimezone);
      if (rule.recurrenceLunarDays.includes(lunarDayValue)) {
        return isWithinRange(candidate, rule.recurrenceUntil) ? candidate : null;
      }
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return null;
}

function isWithinRange(candidate: Date, until: Date | null): boolean {
  return until !== null && candidate <= until;
}

function lunarDay(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-u-ca-chinese-nu-latn', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone,
  });
  const day = formatter.formatToParts(date).find((part) => part.type === 'day')?.value;
  const value = Number(day);
  if (!Number.isInteger(value)) {
    throw new BadRequestException({ code: 'LUNAR_DATE_UNAVAILABLE', message: 'Could not calculate lunar date' });
  }
  return value;
}
