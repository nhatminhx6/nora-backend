import { Injectable } from '@nestjs/common';
import { FinanceTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';

@Injectable()
export class FinanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  categories(userId: string) {
    return this.prisma.financeCategory.findMany({ where: { userId, isArchived: false }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }] });
  }
  category(id: string, userId: string) { return this.prisma.financeCategory.findFirst({ where: { id, userId, isArchived: false } }); }
  transaction(id: string, userId: string) { return this.prisma.financeTransaction.findFirst({ where: { id, userId }, include: { category: true } }); }
  transactions(userId: string, start: Date, end: Date, page: number) {
    return this.prisma.financeTransaction.findMany({ where: { userId, occurredAt: { gte: start, lt: end } }, include: { category: true }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * 30, take: 30 });
  }
  count(userId: string, start: Date, end: Date) { return this.prisma.financeTransaction.count({ where: { userId, occurredAt: { gte: start, lt: end } } }); }
  totals(userId: string, start: Date, end: Date) {
    return this.prisma.financeTransaction.groupBy({ by: ['type'], where: { userId, occurredAt: { gte: start, lt: end } }, _sum: { amount: true }, _count: true });
  }
  expenseCategories(userId: string, start: Date, end: Date) {
    return this.prisma.financeTransaction.groupBy({ by: ['categoryId'], where: { userId, type: FinanceTransactionType.EXPENSE, occurredAt: { gte: start, lt: end } }, _sum: { amount: true }, _count: true });
  }
  budget(userId: string, month: Date, currency = 'VND') { return this.prisma.financeMonthlyBudget.findUnique({ where: { userId_month_currency: { userId, month, currency } } }); }
  setBudget(userId: string, month: Date, amount: Prisma.Decimal, currency: string) { return this.prisma.financeMonthlyBudget.upsert({ where: { userId_month_currency: { userId, month, currency } }, update: { amount }, create: { userId, month, amount, currency } }); }
  create(data: Prisma.FinanceTransactionUncheckedCreateInput) { return this.prisma.financeTransaction.create({ data, include: { category: true } }); }
  update(id: string, data: Prisma.FinanceTransactionUncheckedUpdateInput) { return this.prisma.financeTransaction.update({ where: { id }, data, include: { category: true } }); }
  delete(id: string) { return this.prisma.financeTransaction.delete({ where: { id } }); }
}
