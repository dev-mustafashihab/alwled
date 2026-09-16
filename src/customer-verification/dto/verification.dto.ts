import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * POST /verification/start accepts NO user-controlled fields that could affect the
 * outcome: the user id comes from the JWT, the status is decided by the domain and
 * the provider reference is issued by the provider only.
 */
export class StartVerificationDto {
  @ApiPropertyOptional({
    example: 'ar',
    description: 'تلميح لغوي فقط (لا يُرسل لأي مزوّد في هذه المرحلة)',
  })
  @IsOptional() @IsString() @MaxLength(8)
  locale?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'إقرار الزبون بالشروط (اختياري، لا يغيّر النتيجة)',
  })
  @IsOptional() @IsBoolean()
  acceptedTerms?: boolean;
}

export class ListVerificationsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit: number = 20;

  @ApiPropertyOptional({
    enum: ['NOT_STARTED', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  })
  @IsOptional() @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'تصفية حسب العميل' })
  @IsOptional() @IsString() @MaxLength(40)
  userId?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'status'], default: 'createdAt' })
  @IsOptional() @IsString()
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsString()
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class RejectVerificationDto {
  @ApiProperty({ example: 'الاسم على المستند لا يطابق بيانات الحساب', minLength: 3, maxLength: 300 })
  @IsString() @MinLength(3) @MaxLength(300)
  reason!: string;
}
