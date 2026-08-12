import { WorkItemPriority, WorkItemRecurrenceType, WorkItemStatus } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateWorkItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsEnum(WorkItemStatus)
  status?: WorkItemStatus;

  @IsOptional()
  @IsEnum(WorkItemPriority)
  priority?: WorkItemPriority;

  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsISO8601()
  dueAt?: string | null;

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

  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsISO8601()
  recurrenceUntil?: string | null;
}
