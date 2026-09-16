import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * `@IsOptional()` would silently accept an explicit `null` (which then blows up in the
 * database layer), and untrimmed input let whitespace-only names through. Both are
 * closed here: nulls are rejected, and values are trimmed before length validation.
 */
const trim = () =>
  Transform(({ value }) => {
    // an explicit JSON null must mean "leave unchanged", not the literal string "null"
    if (value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.trim() : value;
  });
const whenPresent = () => ValidateIf((_, value) => value !== undefined);

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'أحمد' })
  @whenPresent()
  @IsString({ message: 'الاسم الأول يجب أن يكون نصاً' })
  @trim()
  @MinLength(2)
  @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'حسن' })
  @whenPresent()
  @IsString({ message: 'اسم العائلة يجب أن يكون نصاً' })
  @trim()
  @MinLength(2)
  @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ example: '0999111222', description: 'تغيير الهاتف يعيد حالة التوثيق' })
  @whenPresent()
  @IsString()
  @trim()
  @Matches(/^[0-9+\s-]{7,20}$/, { message: 'رقم الهاتف غير صالح' })
  phone?: string;
}
