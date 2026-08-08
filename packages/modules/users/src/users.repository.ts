import { Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import { PrismaService } from '@nora/database';
import type { ResetAccountDataResult, RestartOnboardingResult } from './users.service';

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

  async resetAccountData(userId: string): Promise<ResetAccountDataResult> {
    return this.prisma.$transaction(async (transaction) => {
      const interests = await transaction.interest.findMany({
        where: { userId },
        select: { id: true },
      });

      // Subscriptions are configured per interest but intentionally do not have a
      // direct FK to interests because their events are shared globally.
      let sourceSubscriptions = 0;
      for (const interest of interests) {
        const deleted = await transaction.sourceSubscription.deleteMany({
          where: { config: { path: ['interestId'], equals: interest.id } },
        });
        sourceSubscriptions += deleted.count;
      }

      const notifications = await transaction.notification.deleteMany({ where: { userId } });
      const dailyBriefs = await transaction.dailyBrief.deleteMany({ where: { userId } });
      const watchRules = await transaction.watchRule.deleteMany({ where: { userId } });
      const userInsights = await transaction.userInsight.deleteMany({ where: { userId } });
      const deletedInterests = await transaction.interest.deleteMany({ where: { userId } });

      await transaction.user.update({
        where: { id: userId },
        data: {
          profileData: {
            onboardingCompleted: false,
            onboardingRestartToken: `${Date.now()}-${userId}`,
          },
          notificationPrefs: {},
        },
      });

      return {
        onboardingRequired: true,
        cleared: {
          interests: deletedInterests.count,
          userInsights: userInsights.count,
          notifications: notifications.count,
          dailyBriefs: dailyBriefs.count,
          watchRules: watchRules.count,
          sourceSubscriptions,
        },
      };
    });
  }

  async restartOnboarding(userId: string): Promise<RestartOnboardingResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const profileData =
      typeof user.profileData === 'object' &&
      user.profileData !== null &&
      !Array.isArray(user.profileData)
        ? user.profileData
        : {};

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        profileData: {
          ...profileData,
          onboardingCompleted: false,
          onboardingRestartToken: `${Date.now()}-${userId}`,
        },
      },
    });

    return {
      onboardingRequired: true,
      preservedExistingData: true,
    };
  }
}
