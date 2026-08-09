import { Injectable } from '@nestjs/common';
import { Prisma, WorkItemStatus } from '@prisma/client';
import { PrismaService } from '@nora/database';

@Injectable()
export class WorkItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.WorkItemUncheckedCreateInput) {
    return this.prisma.workItem.create({ data });
  }

  findOwned(id: string, userId: string) {
    return this.prisma.workItem.findFirst({ where: { id, userId } });
  }

  list(userId: string, page: number) {
    return this.prisma.workItem.findMany({
      where: { userId, status: { not: WorkItemStatus.CANCELLED } },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (page - 1) * 20,
      take: 20,
    });
  }

  count(userId: string) {
    return this.prisma.workItem.count({
      where: { userId, status: { not: WorkItemStatus.CANCELLED } },
    });
  }

  update(id: string, data: Prisma.WorkItemUpdateInput) {
    return this.prisma.workItem.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.workItem.delete({ where: { id } });
  }

  findOpen(userId: string) {
    return this.prisma.workItem.findMany({
      where: { userId, status: { in: [WorkItemStatus.TODO, WorkItemStatus.IN_PROGRESS] } },
      orderBy: [{ priority: 'desc' }, { dueAt: { sort: 'asc', nulls: 'last' } }],
    });
  }
}
