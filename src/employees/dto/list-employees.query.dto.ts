import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class ListEmployeesQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'بحث بالاسم/البريد/الهاتف' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'EMPLOYEE', description: 'اسم الدور (نظامي أو مخصص)' })
  @IsOptional() @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'DELETED'])
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ enum: ['createdAt', 'firstName', 'lastName', 'email', 'status', 'lastLoginAt'], default: 'createdAt' })
  @IsOptional() @IsIn(['createdAt', 'firstName', 'lastName', 'email', 'status', 'lastLoginAt'])
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
