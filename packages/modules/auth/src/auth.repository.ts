import { Injectable } from '@nestjs/common';
import { Prisma, RefreshToken, User, UserStatus } from '@prisma/client';
import { PrismaService } from '@nora/database';

export interface NewUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface NewRefreshTokenInput {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export type RefreshTokenWithUser = RefreshToken & { user: User };

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  createUser(input: NewUserInput): Promise<User> {
    return this.prisma.user.create({ data: input });
  }

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findActiveUserById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, status: UserStatus.ACTIVE } });
  }

  createRefreshToken(input: NewRefreshTokenInput): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data: input });
  }

  findRefreshToken(tokenHash: string): Promise<RefreshTokenWithUser | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  }

  async rotateRefreshToken(
    currentTokenId: string,
    replacement: NewRefreshTokenInput,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (transaction) => {
        const updated = await transaction.refreshToken.updateMany({
          where: { id: currentTokenId, usedAt: null, revokedAt: null },
          data: { usedAt: new Date() },
        });
        if (updated.count !== 1) {
          return false;
        }

        const next = await transaction.refreshToken.create({ data: replacement });
        await transaction.refreshToken.update({
          where: { id: currentTokenId },
          data: { replacedByTokenId: next.id },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }
}
