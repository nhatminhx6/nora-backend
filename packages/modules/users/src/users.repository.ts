import { Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import { PrismaService } from '@nora/database';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, status: UserStatus.ACTIVE } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  updateProfile(
    id: string,
    input: {
      displayName?: string;
      timezone?: string;
      locale?: string;
      notificationPrefs?: Prisma.InputJsonValue;
      profileData?: Prisma.InputJsonValue;
    },
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: input });
  }

  async deleteAccountByEmail(email: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const user = await transaction.user.findFirst({
        where: { email, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      if (!user) {
        return false;
      }

      const deleted = await transaction.user.updateMany({
        where: { id: user.id, status: UserStatus.ACTIVE },
        data: {
          status: UserStatus.DELETED,
          deletedAt: now,
          email: `deleted+${user.id}@nora.invalid`,
          passwordHash: null,
          displayName: 'Deleted User',
          notificationPrefs: {},
        },
      });

      if (deleted.count !== 1) {
        return false;
      }

      await transaction.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'ACCOUNT_DELETED' },
      });
      await transaction.device.updateMany({
        where: { userId: user.id, isActive: true },
        data: { isActive: false, pushToken: null, pushTokenHash: null },
      });
      return true;
    });
  }
}
