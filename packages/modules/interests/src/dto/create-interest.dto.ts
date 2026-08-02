import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInterestDto {
  @ApiProperty({ example: 'SwiftUI' })
  @IsString({ message: 'name must be a string' })
  @MinLength(1, { message: 'name is required' })
  @MaxLength(160, { message: 'name must not exceed 160 characters' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(2000, { message: 'description must not exceed 2000 characters' })
  description?: string;

  @ApiProperty({ enum: EntityType, example: EntityType.TECHNOLOGY })
  @IsEnum(EntityType, { message: 'type must be a valid entity type' })
  type!: EntityType;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject({ message: 'config must be an object' })
  config?: Record<string, unknown>;
}
