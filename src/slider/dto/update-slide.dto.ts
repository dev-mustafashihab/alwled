import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** حالات صورة الجوال الثلاث — غير ملتبسة. */
export const MOBILE_MODES = ['keep', 'replace', 'remove'] as const;
export type MobileMode = (typeof MOBILE_MODES)[number];

export class UpdateSlideDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(300) altText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) linkUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;

  @ApiPropertyOptional({ enum: MOBILE_MODES, default: 'keep',
    description: 'keep = إبقاء الصورة الحالية · replace = استبدالها بالملف المرفق · remove = إزالتها (تصبح null)' })
  @IsOptional() @IsIn(MOBILE_MODES as unknown as string[])
  mobileMode?: MobileMode;
}
