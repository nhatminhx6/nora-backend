import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { defaultMarketPreferences } from '@nora/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersRepository } from './users.repository';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  locale: string;
  homeMarket: string;
  followedMarkets: string[];
  createdAt: Date;
  updatedAt: Date;
  notificationPrefs: unknown;
  profileData: unknown;
}

export interface ResetAccountDataResult {
  onboardingRequired: true;
  cleared: {
    interests: number;
    userInsights: number;
    notifications: number;
    dailyBriefs: number;
    watchRules: number;
    workItems: number;
    sourceSubscriptions: number;
  };
}

export interface RestartOnboardingResult {
  onboardingRequired: true;
  preservedExistingData: true;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService,
  ) {}

  async getProfile(id: string): Promise<UserProfile> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      locale: user.locale,
      homeMarket: user.homeMarket,
      followedMarkets: user.followedMarkets,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      notificationPrefs: user.notificationPrefs,
      profileData: user.profileData,
    };
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const current = await this.usersRepository.findById(id);
    if (!current) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
    }

    const currentPrefs = this.asObject(current.notificationPrefs);
    const notificationPrefs = {
      ...currentPrefs,
      ...(dto.notificationIntensity === undefined ? {} : { intensity: dto.notificationIntensity }),
      ...(dto.dailyBriefTime === undefined ? {} : { dailyBriefTime: dto.dailyBriefTime }),
    };
    const currentProfileData = this.asObject(current.profileData);
    const locale = (dto.locale?.trim() ?? current.locale) as 'vi' | 'en';
    const onboardingDefaults =
      dto.onboardingCompleted === true && currentProfileData.onboardingCompleted !== true
        ? defaultMarketPreferences(locale)
        : null;
    const homeMarket = dto.homeMarket ?? onboardingDefaults?.homeMarket ?? current.homeMarket;
    const followedMarkets = [
      ...new Set(
        (
          dto.followedMarkets ??
          onboardingDefaults?.followedMarkets ??
          current.followedMarkets
        ).filter((market) => market !== homeMarket),
      ),
    ];
    const profileData = {
      ...currentProfileData,
      ...(dto.onboardingCompleted === undefined
        ? {}
        : { onboardingCompleted: dto.onboardingCompleted }),
      ...(dto.onboardingCompleted === true ? { onboardingRestartToken: null } : {}),
      ...(dto.onboardingCompleted === true ? { contentFeedVersion: 'v2' } : {}),
      ...(dto.profession === undefined ? {} : { profession: dto.profession.trim() || null }),
      ...(dto.interests === undefined
        ? {}
        : { interests: dto.interests.map((value) => value.trim()).filter(Boolean) }),
      ...(dto.goals === undefined
        ? {}
        : { goals: dto.goals.map((value) => value.trim()).filter(Boolean) }),
      ...(dto.locations === undefined
        ? {}
        : { locations: dto.locations.map((value) => value.trim()).filter(Boolean) }),
    };
    const user = await this.usersRepository.updateProfile(id, {
      ...(dto.displayName === undefined ? {} : { displayName: dto.displayName.trim() }),
      ...(dto.timezone === undefined ? {} : { timezone: dto.timezone.trim() }),
      ...(dto.locale === undefined ? {} : { locale: dto.locale.trim() }),
      homeMarket,
      followedMarkets,
      notificationPrefs,
      profileData,
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      locale: user.locale,
      homeMarket: user.homeMarket,
      followedMarkets: user.followedMarkets,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      notificationPrefs: user.notificationPrefs,
      profileData: user.profileData,
    };
  }

  async resetAccountData(id: string): Promise<ResetAccountDataResult> {
    const current = await this.usersRepository.findById(id);
    if (!current) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
    }
    return this.usersRepository.resetAccountData(id);
  }

  async restartOnboardingByEmail(email: string): Promise<RestartOnboardingResult> {
    // Development-only convenience endpoint. It intentionally does not
    // require a session so QA can restart onboarding with only an email.
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException({ code: 'ROUTE_NOT_FOUND', message: 'Route was not found' });
    }

    const user = await this.usersRepository.findByEmail(email.trim().toLowerCase());
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
    }
    return this.usersRepository.restartOnboarding(user.id);
  }

  private asObject(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  async deleteAccountByEmail(email: string): Promise<void> {
    // TODO(production): Remove this development-only endpoint before production deployment.
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException({ code: 'ROUTE_NOT_FOUND', message: 'Route was not found' });
    }

    const deleted = await this.usersRepository.deleteAccountByEmail(email.trim().toLowerCase());
    if (!deleted) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
    }
  }
}
