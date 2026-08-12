import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkItemRecurrenceType, WorkItemStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CreateWorkItemDto } from './create-work-item.dto';
import { UpdateWorkItemDto } from './update-work-item.dto';
import { WorkItemsRepository } from './work-items.repository';
import { nextOccurrence, RecurrenceRule, validateRecurrence } from './work-item-recurrence';

@Injectable()
export class WorkItemsService {
  constructor(private readonly repository: WorkItemsRepository) {}

  create(userId: string, dto: CreateWorkItemDto) {
    const recurrenceType = dto.recurrenceType ?? WorkItemRecurrenceType.NONE;
    const recurrenceUntil = dto.recurrenceUntil ? new Date(dto.recurrenceUntil) : null;
    const rule: RecurrenceRule = {
      recurrenceType,
      recurrenceInterval: dto.recurrenceInterval ?? 1,
      recurrenceWeekdays: dto.recurrenceWeekdays ?? [],
      recurrenceLunarDays: dto.recurrenceLunarDays ?? [],
      recurrenceTimezone: dto.recurrenceTimezone ?? 'Asia/Ho_Chi_Minh',
      recurrenceUntil,
    };
    validateRecurrence(rule);
    const preferredDueAt = dto.dueAt
      ? new Date(dto.dueAt)
      : recurrenceType === WorkItemRecurrenceType.NONE ? null : new Date();
    const dueAt = this.resolveFirstDueAt(rule, preferredDueAt);
    this.validateRange(rule, dueAt);

    return this.repository.create({
      userId,
      title: dto.title.trim(),
      notes: dto.notes?.trim(),
      priority: dto.priority,
      dueAt,
      source: dto.source,
      sourceRef: dto.sourceRef,
      ...rule,
      recurrenceSeriesId: recurrenceType === WorkItemRecurrenceType.NONE ? null : randomUUID(),
    });
  }

  async list(userId: string, rawPage?: string) {
    const page = this.parsePage(rawPage);
    const [items, total] = await Promise.all([
      this.repository.list(userId, page),
      this.repository.count(userId),
    ]);
    return { items, pagination: { page, pageSize: 20, total, hasNextPage: page * 20 < total } };
  }

  async brief(userId: string) {
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const items = await this.repository.findOpen(userId);
    const overdue = items.filter((item) => item.dueAt && item.dueAt < now);
    const today = items.filter(
      (item) => item.dueAt && item.dueAt >= now && item.dueAt <= endOfToday,
    );
    const upcoming = items.filter((item) => !item.dueAt || item.dueAt > endOfToday).slice(0, 5);
    return { overdue, today, upcoming, counts: { overdue: overdue.length, today: today.length } };
  }

  async update(userId: string, id: string, dto: UpdateWorkItemDto) {
    const item = await this.requireOwned(userId, id);
    const recurrenceType = dto.recurrenceType ?? item.recurrenceType;
    const recurrenceUntil = dto.recurrenceUntil === undefined
      ? item.recurrenceUntil
      : dto.recurrenceUntil ? new Date(dto.recurrenceUntil) : null;
    const rule: RecurrenceRule = {
      recurrenceType,
      recurrenceInterval: dto.recurrenceInterval ?? item.recurrenceInterval,
      recurrenceWeekdays: dto.recurrenceWeekdays ?? item.recurrenceWeekdays,
      recurrenceLunarDays: dto.recurrenceLunarDays ?? item.recurrenceLunarDays,
      recurrenceTimezone: dto.recurrenceTimezone ?? item.recurrenceTimezone,
      recurrenceUntil,
    };
    validateRecurrence(rule);
    const dueAt = dto.dueAt === undefined ? item.dueAt : dto.dueAt ? new Date(dto.dueAt) : null;
    this.validateRange(rule, dueAt);

    const nextDueAt = dto.status === WorkItemStatus.DONE &&
      item.status !== WorkItemStatus.DONE &&
      item.dueAt
      ? nextOccurrence(rule, item.dueAt, item.dueAt)
      : null;
    return this.repository.update(id, {
      ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
      ...(dto.notes === undefined ? {} : { notes: dto.notes.trim() }),
      ...(dto.priority === undefined ? {} : { priority: dto.priority }),
      ...(nextDueAt ? { dueAt: nextDueAt } : dto.dueAt === undefined ? {} : { dueAt }),
      ...(dto.recurrenceType === undefined ? {} : { recurrenceType }),
      ...(dto.recurrenceInterval === undefined ? {} : { recurrenceInterval: rule.recurrenceInterval }),
      ...(dto.recurrenceWeekdays === undefined ? {} : { recurrenceWeekdays: rule.recurrenceWeekdays }),
      ...(dto.recurrenceLunarDays === undefined ? {} : { recurrenceLunarDays: rule.recurrenceLunarDays }),
      ...(dto.recurrenceTimezone === undefined ? {} : { recurrenceTimezone: rule.recurrenceTimezone }),
      ...(dto.recurrenceUntil === undefined ? {} : { recurrenceUntil }),
      ...(dto.recurrenceType === undefined ? {} : {
        recurrenceSeriesId: recurrenceType === WorkItemRecurrenceType.NONE
          ? null
          : item.recurrenceSeriesId ?? randomUUID(),
      }),
      ...(nextDueAt ? { recurrenceSequence: item.recurrenceSequence + 1 } : {}),
      ...(dto.status === undefined
        ? {}
        : {
            status: nextDueAt ? WorkItemStatus.TODO : dto.status,
            completedAt: dto.status === WorkItemStatus.DONE && !nextDueAt ? new Date() : null,
          }),
    });
  }

  private resolveFirstDueAt(rule: RecurrenceRule, preferred: Date | null): Date | null {
    if (rule.recurrenceType === WorkItemRecurrenceType.NONE) return preferred;
    if (!preferred) return null;
    if (rule.recurrenceType === WorkItemRecurrenceType.DAILY) return preferred;
    const justBeforeNow = new Date(Date.now() - 1);
    return nextOccurrence(rule, justBeforeNow, preferred);
  }

  private validateRange(rule: RecurrenceRule, firstDueAt: Date | null): void {
    if (rule.recurrenceType === WorkItemRecurrenceType.NONE) return;
    if (!firstDueAt || !rule.recurrenceUntil || rule.recurrenceUntil < firstDueAt) {
      throw new BadRequestException({
        code: 'INVALID_RECURRENCE_RANGE', message: 'Recurrence end must be after its first occurrence',
      });
    }
    const maximum = new Date(firstDueAt);
    maximum.setUTCFullYear(maximum.getUTCFullYear() + 1);
    if (rule.recurrenceUntil > maximum) {
      throw new BadRequestException({
        code: 'RECURRENCE_RANGE_TOO_LONG', message: 'Recurrence range cannot exceed one year',
      });
    }
  }

  async delete(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.repository.delete(id);
    return { deleted: true };
  }

  private async requireOwned(userId: string, id: string) {
    const item = await this.repository.findOwned(id, userId);
    if (!item) {
      throw new NotFoundException({
        code: 'WORK_ITEM_NOT_FOUND',
        message: 'Work item was not found',
      });
    }
    return item;
  }

  private parsePage(rawPage?: string): number {
    const page = Number(rawPage ?? '1');
    return Number.isInteger(page) && page > 0 ? page : 1;
  }
}
