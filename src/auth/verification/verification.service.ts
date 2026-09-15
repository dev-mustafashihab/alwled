import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { VerificationChannel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { generateNumericCode, generateOpaqueToken, sha256 } from '../../common/utils/crypto.util';
import { TOKEN_TTL } from '../../common/constants';
import { VERIFICATION_PROVIDERS, VerificationProvider } from './verification-provider.interface';
import { LogVerificationProvider } from './log-verification.provider';

@Injectable()
export class VerificationService {
  private readonly providers: VerificationProvider[];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(VERIFICATION_PROVIDERS) providers?: VerificationProvider[],
  ) {
    this.providers = providers?.length ? providers : [new LogVerificationProvider()];
  }

  private pickProvider(channel: VerificationChannel): VerificationProvider {
    return this.providers.find((p) => p.channel === channel) ?? this.providers[0];
  }

  /** Creates a single-use, short-lived verification token and hands it to the provider. */
  async issue(userId: string, destination: string | null, channel: VerificationChannel) {
    await this.prisma.verificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const channelToUse = channel ?? VerificationChannel.OTP;
    const token =
      channelToUse === VerificationChannel.OTP ? generateNumericCode(6) : generateOpaqueToken(32);
    const expiresAt = new Date(Date.now() + TOKEN_TTL.verificationMinutes * 60_000);

    await this.prisma.verificationToken.create({
      data: { userId, tokenHash: sha256(token), channel: channelToUse, destination, expiresAt },
    });

    await this.pickProvider(channelToUse).send({
      userId, destination, channel: channelToUse, token, expiresAt,
    });

    return { channel: channelToUse, expiresAt, token };
  }

  /** Consumes a verification token; throws when invalid/expired/already used. */
  async consume(token: string) {
    const row = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException('رمز التحقق غير صالح أو منتهي');
    }
    await this.prisma.verificationToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    return row;
  }

  /** Basic abuse protection for resend flows. */
  countRecent(userId: string, minutes = 10) {
    return this.prisma.verificationToken.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - minutes * 60_000) } },
    });
  }
}
