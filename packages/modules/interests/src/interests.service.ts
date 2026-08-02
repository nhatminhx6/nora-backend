import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Interest, Prisma } from '@prisma/client';
import { CreateInterestDto } from './dto/create-interest.dto';
import { UpdateInterestDto } from './dto/update-interest.dto';
import { InterestsRepository } from './interests.repository';

@Injectable()
export class InterestsService {
  constructor(private readonly interestsRepository: InterestsRepository) {}

  list(userId: string): Promise<Interest[]> {
    return this.interestsRepository.list(userId);
  }

  async create(userId: string, dto: CreateInterestDto): Promise<Interest> {
    const name = dto.name.trim();
    try {
      return await this.interestsRepository.create({
        userId,
        name,
        normalizedName: this.normalizeName(name),
        ...(dto.description === undefined ? {} : { description: dto.description.trim() }),
        type: dto.type,
        ...(dto.config === undefined ? {} : { config: dto.config as Prisma.InputJsonObject }),
      });
    } catch (error) {
      this.handleUniqueName(error);
      throw error;
    }
  }

  async update(userId: string, id: string, dto: UpdateInterestDto): Promise<Interest> {
    if (!(await this.interestsRepository.findOwned(id, userId))) {
      throw new NotFoundException({ code: 'INTEREST_NOT_FOUND', message: 'Interest was not found' });
    }
    const name = dto.name?.trim();
    try {
      return await this.interestsRepository.update(id, {
        ...(name === undefined ? {} : { name, normalizedName: this.normalizeName(name) }),
        ...(dto.description === undefined ? {} : { description: dto.description.trim() }),
        ...(dto.type === undefined ? {} : { type: dto.type }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.config === undefined ? {} : { config: dto.config as Prisma.InputJsonObject }),
      });
    } catch (error) {
      this.handleUniqueName(error);
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.interestsRepository.archive(id, userId))) {
      throw new NotFoundException({ code: 'INTEREST_NOT_FOUND', message: 'Interest was not found' });
    }
  }

  private normalizeName(name: string): string {
    return name.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  }

  private handleUniqueName(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        code: 'INTEREST_ALREADY_EXISTS',
        message: 'An interest with this name already exists',
      });
    }
  }
}
