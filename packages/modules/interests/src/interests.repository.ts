import { Injectable } from '@nestjs/common';
import { EntityType, Interest, InterestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';

@Injectable()
export class InterestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<Interest[]> {
    return this.prisma.interest.findMany({
      where: { userId, deletedAt: null, status: { not: InterestStatus.ARCHIVED } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(input: {
    userId: string;
    name: string;
    normalizedName: string;
    description?: string;
    type: EntityType;
    config?: Prisma.InputJsonValue;
  }): Promise<Interest> {
    return this.prisma.interest.create({ data: input });
  }

  findOwned(id: string, userId: string): Promise<Interest | null> {
    return this.prisma.interest.findFirst({ where: { id, userId, deletedAt: null } });
  }

  update(
    id: string,
    input: {
      name?: string;
      normalizedName?: string;
      description?: string;
      type?: EntityType;
      status?: InterestStatus;
      config?: Prisma.InputJsonValue;
    },
  ): Promise<Interest> {
    return this.prisma.interest.update({ where: { id }, data: input });
  }

  async archive(id: string, userId: string): Promise<boolean> {
    const result = await this.prisma.interest.updateMany({
      where: { id, userId, deletedAt: null },
      data: { status: InterestStatus.ARCHIVED, deletedAt: new Date() },
    });
    return result.count === 1;
  }
}
