import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinanceTransactionType, Prisma } from '@prisma/client';
import { CreateFinanceTransactionDto, SetFinanceBudgetDto, UpdateFinanceTransactionDto } from './finance.dto';
import { FinanceRepository } from './finance.repository';

@Injectable()
export class FinanceService {
  constructor(private readonly repository: FinanceRepository) {}

  categories(userId: string) { return this.repository.categories(userId); }

  async list(userId: string, month?: string, rawPage?: string) {
    const { start, end, key } = this.monthRange(month);
    const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);
    const [items, total] = await Promise.all([this.repository.transactions(userId, start, end, page), this.repository.count(userId, start, end)]);
    return { month: key, items, pagination: { page, pageSize: 30, total, hasNextPage: page * 30 < total } };
  }

  async summary(userId: string, month?: string) {
    const { start, end, key } = this.monthRange(month);
    const [totals, groups, categories, budget] = await Promise.all([
      this.repository.totals(userId, start, end), this.repository.expenseCategories(userId, start, end), this.repository.categories(userId), this.repository.budget(userId, start),
    ]);
    const value = (type: FinanceTransactionType) => totals.find((item) => item.type === type)?._sum.amount ?? new Prisma.Decimal(0);
    const income = value(FinanceTransactionType.INCOME);
    const expense = value(FinanceTransactionType.EXPENSE);
    const budgetAmount = budget?.amount ?? new Prisma.Decimal(0);
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    return { month: key, currency: 'VND', income, expense, balance: income.minus(expense), budget: budgetAmount, budgetRemaining: budgetAmount.minus(expense), expenseByCategory: groups.map((group) => ({ category: categoryMap.get(group.categoryId), amount: group._sum.amount ?? 0, count: group._count })) };
  }

  async create(userId: string, dto: CreateFinanceTransactionDto) {
    await this.requireCategory(userId, dto.categoryId, dto.type);
    return this.repository.create({ userId, categoryId: dto.categoryId, type: dto.type, amount: this.amount(dto.amount), title: dto.title.trim(), notes: dto.notes?.trim() || null, occurredAt: new Date(dto.occurredAt) });
  }

  async update(userId: string, id: string, dto: UpdateFinanceTransactionDto) {
    const item = await this.requireTransaction(userId, id);
    const type = dto.type ?? item.type;
    const categoryId = dto.categoryId ?? item.categoryId;
    await this.requireCategory(userId, categoryId, type);
    return this.repository.update(id, { ...(dto.type && { type }), ...(dto.categoryId && { categoryId }), ...(dto.amount && { amount: this.amount(dto.amount) }), ...(dto.title && { title: dto.title.trim() }), ...(dto.notes !== undefined && { notes: dto.notes.trim() || null }), ...(dto.occurredAt && { occurredAt: new Date(dto.occurredAt) }) });
  }

  async delete(userId: string, id: string) { await this.requireTransaction(userId, id); await this.repository.delete(id); return { deleted: true }; }
  async setBudget(userId: string, month: string | undefined, dto: SetFinanceBudgetDto) { const { start } = this.monthRange(month); return this.repository.setBudget(userId, start, this.amount(dto.amount, true), (dto.currency ?? 'VND').toUpperCase()); }

  private amount(raw: string, allowZero = false) { const value = new Prisma.Decimal(raw); if ((!allowZero && value.lte(0)) || (allowZero && value.lt(0))) throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'Amount must be positive' }); return value; }
  private async requireCategory(userId: string, id: string, type: FinanceTransactionType) { const category = await this.repository.category(id, userId); if (!category || category.type !== type) throw new BadRequestException({ code: 'INVALID_FINANCE_CATEGORY', message: 'Category does not match transaction type' }); return category; }
  private async requireTransaction(userId: string, id: string) { const item = await this.repository.transaction(id, userId); if (!item) throw new NotFoundException({ code: 'FINANCE_TRANSACTION_NOT_FOUND', message: 'Transaction was not found' }); return item; }
  private monthRange(raw?: string) { const key = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : new Date().toISOString().slice(0, 7); const [year, month] = key.split('-').map(Number); const start = new Date(Date.UTC(year!, month! - 1, 1)); return { key, start, end: new Date(Date.UTC(year!, month!, 1)) }; }
}
