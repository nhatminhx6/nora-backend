import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInterestDto {
  @ApiProperty({ example: 'travel' })
  @IsString({ message: 'topicKey must be a string' })
  @MaxLength(80, { message: 'topicKey must not exceed 80 characters' })
  topicKey!: string;

  @ApiPropertyOptional({ type: [String], example: ['Cửu Trại Câu', 'Thành Đô'] })
  @IsOptional()
  @IsArray({ message: 'refinements must be an array' })
  @ArrayMaxSize(12, { message: 'refinements must not contain more than 12 values' })
  @IsString({ each: true, message: 'each refinement must be a string' })
  @MaxLength(80, { each: true, message: 'each refinement must not exceed 80 characters' })
  refinements?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject({ message: 'config must be an object' })
  config?: Record<string, unknown>;
}
