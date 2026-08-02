import { ApiPropertyOptional } from '@nestjs/swagger';
import { EntityType, InterestStatus } from '@prisma/client';
import { IsEnum, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateInterestDto {
  @ApiPropertyOptional({ example: 'SwiftUI' })
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  @MinLength(1, { message: 'name must not be empty' })
  @MaxLength(160, { message: 'name must not exceed 160 characters' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(2000, { message: 'description must not exceed 2000 characters' })
  description?: string;

  @ApiPropertyOptional({ enum: EntityType })
  @IsOptional()
  @IsEnum(EntityType, { message: 'type must be a valid entity type' })
  type?: EntityType;

  @ApiPropertyOptional({ enum: [InterestStatus.ACTIVE, InterestStatus.PAUSED] })
  @IsOptional()
  @IsIn([InterestStatus.ACTIVE, InterestStatus.PAUSED], {
    message: 'status must be ACTIVE or PAUSED',
  })
  status?: InterestStatus;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject({ message: 'config must be an object' })
  config?: Record<string, unknown>;
}
