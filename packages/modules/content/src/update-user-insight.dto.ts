import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateUserInsightDto {
  @ApiPropertyOptional({ enum: ['UNREAD', 'READ', 'DISMISSED'] })
  @IsOptional()
  @IsIn(['UNREAD', 'READ', 'DISMISSED'], { message: 'status must be UNREAD, READ, or DISMISSED' })
  status?: 'UNREAD' | 'READ' | 'DISMISSED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isSaved must be a boolean' })
  isSaved?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isUseful must be a boolean' })
  isUseful?: boolean;
}
