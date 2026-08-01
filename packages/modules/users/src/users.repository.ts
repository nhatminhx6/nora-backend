import { Injectable } from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
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
}
