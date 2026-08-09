import { WorkItemPriority, WorkItemSource } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsEnum(WorkItemPriority)
  priority?: WorkItemPriority;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsEnum(WorkItemSource)
  source?: WorkItemSource;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceRef?: string;
}
