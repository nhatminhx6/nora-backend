import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Server-authoritative onboarding completion state' })
  @IsOptional()
  @IsBoolean({ message: 'onboardingCompleted must be a boolean' })
  onboardingCompleted?: boolean;

  @ApiPropertyOptional({ example: 'Nora User' })
  @IsOptional()
  @IsString({ message: 'displayName must be a string' })
  @MinLength(1, { message: 'displayName must not be empty' })
  @MaxLength(120, { message: 'displayName must not exceed 120 characters' })
  displayName?: string;

  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString({ message: 'timezone must be a string' })
  @MaxLength(64, { message: 'timezone must not exceed 64 characters' })
  timezone?: string;

  @ApiPropertyOptional({ example: 'vi' })
  @IsOptional()
  @IsString({ message: 'locale must be a string' })
  @MaxLength(16, { message: 'locale must not exceed 16 characters' })
  locale?: string;

  @ApiPropertyOptional({ enum: ['minimal', 'balanced', 'active'] })
  @IsOptional()
  @IsIn(['minimal', 'balanced', 'active'], {
    message: 'notificationIntensity must be one of: minimal, balanced, active',
  })
  notificationIntensity?: 'minimal' | 'balanced' | 'active';

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'dailyBriefTime must use 24-hour HH:mm format',
  })
  dailyBriefTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'profession must be a string' })
  @MaxLength(160, { message: 'profession must not exceed 160 characters' })
  profession?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray({ message: 'interests must be an array' })
  @IsString({ each: true, message: 'each interest must be a string' })
  @MaxLength(160, { each: true, message: 'each interest must not exceed 160 characters' })
  interests?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray({ message: 'goals must be an array' })
  @IsString({ each: true, message: 'each goal must be a string' })
  @MaxLength(300, { each: true, message: 'each goal must not exceed 300 characters' })
  goals?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray({ message: 'locations must be an array' })
  @IsString({ each: true, message: 'each location must be a string' })
  @MaxLength(160, { each: true, message: 'each location must not exceed 160 characters' })
  locations?: string[];
}
