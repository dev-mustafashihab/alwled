import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * The customer declares a manual Sham Cash transfer. Everything financial
 * (amount/currency/user) stays server-controlled — only the transfer evidence is
 * accepted here.
 */
export class SubmitPaymentProofDto {
  @ApiProperty({
    example: 'SC-2026-0098231',
    description: 'رقم عملية التحويل كما يظهر في تطبيق شام كاش (فريد — لا يُقبل مرتين)',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9\-_/]+$/, { message: 'رقم العملية يقبل أحرفاً وأرقاماً و - _ / فقط' })
  transactionReference!: string;

  @ApiProperty({
    example: 'https://cdn.example.com/proofs/transfer-1.webp',
    description: 'رابط إثبات الدفع (صورة الحوالة) — يُمرَّر عبر Storage abstraction',
  })
  @IsString()
  @MaxLength(512)
  proofUrl!: string;

  @ApiPropertyOptional({ example: 'حوّلت المبلغ الساعة 14:20', maxLength: 300 })
  @IsOptional() @IsString() @MaxLength(300)
  proofNote?: string;
}
