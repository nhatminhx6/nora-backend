import { WorkItemPriority, WorkItemRecurrenceType, WorkItemSource } from '@prisma/client';
import { ArrayUnique, IsArray, IsEnum, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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

  @IsOptional()
  @IsEnum(WorkItemRecurrenceType)
  recurrenceType?: WorkItemRecurrenceType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  recurrenceInterval?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  recurrenceWeekdays?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(30, { each: true })
  recurrenceLunarDays?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  recurrenceTimezone?: string;

  @IsOptional()
  @IsISO8601()
  recurrenceUntil?: string;
}
