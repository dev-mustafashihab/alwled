import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min,
} from 'class-validator';
import { RoleName, UserStatus } from '@prisma/client';

export class ListUsersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'بحث بالاسم/البريد/الهاتف' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsOptional() @IsEnum(RoleName)
  role?: RoleName;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional() @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'تصفية حسب حالة التوثيق' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ enum: ['createdAt', 'firstName', 'lastName', 'email', 'status', 'lastLoginAt'], default: 'createdAt' })
  @IsOptional() @IsIn(['createdAt', 'firstName', 'lastName', 'email', 'status', 'lastLoginAt'])
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
