import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { AuthRepository, NewRefreshTokenInput } from './auth.repository';
import { AuthResponse } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlDays: number;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.accessTtlSeconds = Number(configService.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
    this.refreshTtlDays = Number(configService.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    if (await this.authRepository.findUserByEmail(email)) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email is already registered',
      });
    }

    const user = await this.authRepository.createUser({
      email,
      passwordHash: await hash(dto.password, 12),
      displayName: dto.displayName.trim(),
    });
    return this.issueSession(user.id, user.email, user.displayName);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.authRepository.findUserByEmail(dto.email.trim().toLowerCase());
    const passwordMatches = user?.passwordHash
      ? await compare(dto.password, user.passwordHash)
      : false;
    if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      });
    }
    return this.issueSession(user.id, user.email, user.displayName);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    const stored = await this.authRepository.findRefreshToken(this.hashToken(dto.refreshToken));
    const invalid = !stored || stored.revokedAt || stored.usedAt || stored.expiresAt <= new Date();
    if (invalid) {
      if (stored) {
        await this.authRepository.revokeFamily(stored.familyId, 'TOKEN_REUSE_OR_EXPIRED');
      }
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid',
      });
    }

    const rawToken = this.generateRefreshToken();
    const replacement = this.newRefreshToken(stored.userId, stored.familyId, rawToken);
    const rotated = await this.authRepository.rotateRefreshToken(stored.id, replacement);
    if (!rotated) {
      await this.authRepository.revokeFamily(stored.familyId, 'TOKEN_REUSE_DETECTED');
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token was already used',
      });
    }

    return this.buildResponse(stored.user.id, stored.user.email, stored.user.displayName, rawToken);
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const stored = await this.authRepository.findRefreshToken(this.hashToken(dto.refreshToken));
    if (stored) {
      await this.authRepository.revokeFamily(stored.familyId, 'USER_LOGOUT');
    }
  }

  private async issueSession(
    userId: string,
    email: string,
    displayName: string,
  ): Promise<AuthResponse> {
    const rawToken = this.generateRefreshToken();
    await this.authRepository.createRefreshToken(
      this.newRefreshToken(userId, randomUUID(), rawToken),
    );
    return this.buildResponse(userId, email, displayName, rawToken);
  }

  private async buildResponse(
    userId: string,
    email: string,
    displayName: string,
    refreshToken: string,
  ): Promise<AuthResponse> {
    const accessToken = await this.jwtService.signAsync({ sub: userId, email });
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds,
      user: { id: userId, email, displayName },
    };
  }

  private newRefreshToken(
    userId: string,
    familyId: string,
    rawToken: string,
  ): NewRefreshTokenInput {
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + this.refreshTtlDays);
    return { userId, familyId, tokenHash: this.hashToken(rawToken), expiresAt };
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
