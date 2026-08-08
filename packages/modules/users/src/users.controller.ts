import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtUser } from '@nora/auth';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfile, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @JwtAuthGuard()
  getMe(@CurrentUser() user: JwtUser): Promise<UserProfile> {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  @JwtAuthGuard()
  updateMe(@CurrentUser() user: JwtUser, @Body() dto: UpdateProfileDto): Promise<UserProfile> {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Delete('me/data')
  @JwtAuthGuard()
  @ApiOperation({ summary: 'Clear personalized account data and restart onboarding' })
  @ApiOkResponse({ description: 'Personalized data cleared; authentication remains valid' })
  resetMyData(@CurrentUser() user: JwtUser) {
    return this.usersService.resetAccountData(user.id);
  }

  @Post('onboarding/restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Development only] Restart onboarding by email' })
  @ApiOkResponse({ description: 'Personalized data cleared; account remains active' })
  restartOnboarding(@Body() dto: DeleteAccountDto) {
    return this.usersService.restartOnboardingByEmail(dto.email);
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Development only] Delete an account by registered email' })
  @ApiNoContentResponse({ description: 'Account deleted' })
  deleteAccount(@Body() dto: DeleteAccountDto): Promise<void> {
    return this.usersService.deleteAccountByEmail(dto.email);
  }
}
