import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320, { message: 'email must not exceed 320 characters' })
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString({ message: 'password must be a string' })
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(72, { message: 'password must not exceed 72 characters' })
  password!: string;

  @ApiProperty({ example: 'Nora User' })
  @IsString({ message: 'displayName must be a string' })
  @MinLength(1, { message: 'displayName is required' })
  @MaxLength(120, { message: 'displayName must not exceed 120 characters' })
  displayName!: string;
}
