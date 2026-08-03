import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Interest } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, JwtUser } from '@nora/auth';
import { CreateInterestDto } from './dto/create-interest.dto';
import { UpdateInterestDto } from './dto/update-interest.dto';
import { InterestsService } from './interests.service';

@ApiTags('interests')
@ApiBearerAuth()
@Controller('interests')
export class InterestsController {
  constructor(private readonly interestsService: InterestsService) {}

  @Get()
  @JwtAuthGuard()
  list(@CurrentUser() user: JwtUser): Promise<Interest[]> {
    return this.interestsService.list(user.id);
  }

  @Get('catalog')
  @JwtAuthGuard()
  catalog(@Query('locale') locale?: string) {
    return this.interestsService.catalog(locale);
  }

  @Post()
  @JwtAuthGuard()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateInterestDto): Promise<Interest> {
    return this.interestsService.create(user.id, dto);
  }

  @Patch(':id')
  @JwtAuthGuard()
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInterestDto,
  ): Promise<Interest> {
    return this.interestsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @JwtAuthGuard()
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.interestsService.remove(user.id, id);
  }
}
