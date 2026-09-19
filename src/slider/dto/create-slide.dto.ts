import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSlideDto {
  @ApiPropertyOptional({ description: 'نص بديل وصفي للصورة (إتاحة)' })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(300)
  altText?: string;

  @ApiPropertyOptional({ description: 'رابط داخلي (#/...) أو http(s):// — لا سكيمات خطرة' })
  @IsOptional() @IsString() @MaxLength(512)
  linkUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean() isEnabled?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;
}
