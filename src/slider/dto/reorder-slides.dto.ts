import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Min } from 'class-validator';

export class ReorderSlidesDto {
  @ApiProperty({ type: [Number], description: 'معرّفات الشرائح بالترتيب المطلوب (بلا تكرار)' })
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) @Min(1, { each: true })
  @Type(() => Number)
  ids!: number[];
}
