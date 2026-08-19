import { Body, Controller, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtUser } from '@nora/auth';
import { ReplaceTopicSelectionDto } from './dto/replace-topic-selection.dto';
import { PreparedContentService } from './prepared-content.service';

@ApiTags('interests')
@ApiBearerAuth()
@Controller('v2/users/me/topics')
export class TopicSelectionController {
  constructor(private readonly preparedContent: PreparedContentService) {}

  @Put()
  @JwtAuthGuard()
  replace(@CurrentUser() user: JwtUser, @Body() dto: ReplaceTopicSelectionDto) {
    return this.preparedContent.replaceSelection(user.id, dto.topics);
  }
}
