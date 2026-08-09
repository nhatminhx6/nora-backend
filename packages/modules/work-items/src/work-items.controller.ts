import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtUser } from '@nora/auth';
import { CreateWorkItemDto } from './create-work-item.dto';
import { UpdateWorkItemDto } from './update-work-item.dto';
import { WorkItemsService } from './work-items.service';

@ApiTags('work-items')
@ApiBearerAuth()
@Controller('work-items')
@JwtAuthGuard()
export class WorkItemsController {
  constructor(private readonly service: WorkItemsService) {}

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateWorkItemDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtUser, @Query('page') page?: string) {
    return this.service.list(user.id, page);
  }

  @Get('brief')
  brief(@CurrentUser() user: JwtUser) {
    return this.service.brief(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkItemDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(user.id, id);
  }
}
