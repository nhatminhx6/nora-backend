import { FinanceTransactionType } from '@prisma/client';
import { IsEnum, IsISO8601, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateFinanceTransactionDto {
  @IsEnum(FinanceTransactionType) type!: FinanceTransactionType;
  @IsNumberString() amount!: string;
  @IsUUID() categoryId!: string;
  @IsString() @MinLength(1) @MaxLength(255) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsISO8601() occurredAt!: string;
}

export class UpdateFinanceTransactionDto {
  @IsOptional() @IsEnum(FinanceTransactionType) type?: FinanceTransactionType;
  @IsOptional() @IsNumberString() amount?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
}

export class SetFinanceBudgetDto {
  @IsNumberString() amount!: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}
