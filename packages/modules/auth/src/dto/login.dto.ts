import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320, { message: 'email must not exceed 320 characters' })
  email!: string;

  @ApiProperty()
  @IsString({ message: 'password must be a string' })
  @MinLength(1, { message: 'password is required' })
  @MaxLength(72, { message: 'password must not exceed 72 characters' })
  password!: string;
}
