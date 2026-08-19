import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class TopicSelectionItemDto {
  @IsString()
  @MaxLength(80)
  key!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  refinements!: string[];
}

export class ReplaceTopicSelectionDto {
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => TopicSelectionItemDto)
  topics!: TopicSelectionItemDto[];
}
