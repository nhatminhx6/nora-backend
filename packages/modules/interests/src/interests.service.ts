import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Interest, Prisma } from '@prisma/client';
import { CreateInterestDto } from './dto/create-interest.dto';
import { UpdateInterestDto } from './dto/update-interest.dto';
import { InterestsRepository } from './interests.repository';
import { parseLocale, TOPIC_CATALOG } from './topic-catalog';
import { PreparedContentService } from './prepared-content.service';

@Injectable()
export class InterestsService {
  constructor(
    private readonly interestsRepository: InterestsRepository,
    private readonly preparedContent: PreparedContentService,
  ) {}

  list(userId: string): Promise<Interest[]> {
    return this.interestsRepository.list(userId);
  }

  async catalog(rawLocale?: string) {
    const locale = parseLocale(rawLocale);
    const inventory = await this.preparedContent.topicInventory(locale);
    const inventoryByKey = new Map(inventory.map((item) => [item.key, item]));
    const available = await this.preparedContent.availableTopicKeys(locale);
    return TOPIC_CATALOG.filter((topic) => available.has(topic.key)).map((topic) => ({
      key: topic.key,
      name: topic.names[locale],
      description: topic.descriptions[locale],
      category: topic.category,
      symbol: topic.symbol,
      refinementLabel: topic.refinementLabels[locale],
      refinementPlaceholder: topic.refinementPlaceholders[locale],
      inventory: inventoryByKey.get(topic.key),
    }));
  }

  async create(userId: string, dto: CreateInterestDto): Promise<Interest> {
    const topicKey = dto.topicKey.trim().toLocaleLowerCase('en-US');
    const topic = TOPIC_CATALOG.find((item) => item.key === topicKey);
    if (!topic) {
      throw new BadRequestException({
        code: 'INVALID_TOPIC_KEY',
        message: 'topicKey must come from the topic catalog',
      });
    }
    const refinements = [
      ...new Set((dto.refinements ?? []).map((value) => value.trim()).filter(Boolean)),
    ];
    const name = topic.names.en;
    const clientConfig = dto.config ?? {};
    try {
      const interest = await this.interestsRepository.create({
        userId,
        topicKey,
        name,
        normalizedName: this.normalizeName(name),
        description: topic.descriptions.en,
        type: topic.type,
        config: {
          ...clientConfig,
          topicKey,
          category: topic.category,
          refinements,
          queryTerms: [name, ...refinements],
        } as Prisma.InputJsonObject,
      });
      await this.preparedContent.matchUser(userId);
      return interest;
    } catch (error) {
      this.handleUniqueName(error);
      throw error;
    }
  }

  async update(userId: string, id: string, dto: UpdateInterestDto): Promise<Interest> {
    if (!(await this.interestsRepository.findOwned(id, userId))) {
      throw new NotFoundException({
        code: 'INTEREST_NOT_FOUND',
        message: 'Interest was not found',
      });
    }
    const name = dto.name?.trim();
    try {
      const interest = await this.interestsRepository.update(id, {
        ...(name === undefined ? {} : { name, normalizedName: this.normalizeName(name) }),
        ...(dto.description === undefined ? {} : { description: dto.description.trim() }),
        ...(dto.type === undefined ? {} : { type: dto.type }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.config === undefined ? {} : { config: dto.config as Prisma.InputJsonObject }),
      });
      await this.preparedContent.matchUser(userId);
      return interest;
    } catch (error) {
      this.handleUniqueName(error);
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.interestsRepository.archive(id, userId))) {
      throw new NotFoundException({
        code: 'INTEREST_NOT_FOUND',
        message: 'Interest was not found',
      });
    }
    await this.preparedContent.matchUser(userId);
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
