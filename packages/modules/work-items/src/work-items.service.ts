import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkItemStatus } from '@prisma/client';
import { CreateWorkItemDto } from './create-work-item.dto';
import { UpdateWorkItemDto } from './update-work-item.dto';
import { WorkItemsRepository } from './work-items.repository';

@Injectable()
export class WorkItemsService {
  constructor(private readonly repository: WorkItemsRepository) {}

  create(userId: string, dto: CreateWorkItemDto) {
    return this.repository.create({
      userId,
      title: dto.title.trim(),
      notes: dto.notes?.trim(),
      priority: dto.priority,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      source: dto.source,
      sourceRef: dto.sourceRef,
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
    await this.requireOwned(userId, id);
    return this.repository.update(id, {
      ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
      ...(dto.notes === undefined ? {} : { notes: dto.notes.trim() }),
      ...(dto.priority === undefined ? {} : { priority: dto.priority }),
      ...(dto.dueAt === undefined ? {} : { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }),
      ...(dto.status === undefined
        ? {}
        : {
            status: dto.status,
            completedAt: dto.status === WorkItemStatus.DONE ? new Date() : null,
          }),
    });
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
