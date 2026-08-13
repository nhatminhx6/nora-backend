import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@nora/database';

@Injectable()
export class EconomicsService {
  constructor(private readonly prisma: PrismaService) {}
  async dashboard(locale?: string) {
    const indicators = await this.prisma.economicIndicator.findMany({ orderBy: { sortOrder: 'asc' }, include: { observations: { orderBy: { observedAt: 'desc' }, take: 2 } } });
    return { updatedAt: new Date(), indicators: indicators.map((item) => this.map(item, locale)) };
  }
  async detail(key: string, range = '1Y', locale?: string) {
    const days = range === '1M' ? 31 : range === '3M' ? 93 : range === '5Y' ? 1826 : 366;
    const indicator = await this.prisma.economicIndicator.findUnique({ where: { key }, include: { observations: { where: { observedAt: { gte: new Date(Date.now() - days * 86400000) } }, orderBy: { observedAt: 'asc' } } } });
    if (!indicator) throw new NotFoundException({ code: 'ECONOMIC_INDICATOR_NOT_FOUND', message: 'Economic indicator was not found' });
    return this.map(indicator, locale);
  }
  private map(item: any, locale?: string) {
    const observations = item.observations ?? [];
    const latest = observations[observations.length - 1] ?? observations[0] ?? null;
    return { key: item.key, name: locale === 'en' ? item.nameEn : item.nameVi, category: item.category, unit: item.unit, frequency: item.frequency, sourceName: item.sourceName, sourceUrl: item.sourceUrl, symbolName: item.symbolName, latest, observations };
  }
}
