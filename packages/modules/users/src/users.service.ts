import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  locale: string;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

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
      createdAt: user.createdAt,
    };
  }
}
