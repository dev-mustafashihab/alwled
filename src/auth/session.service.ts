import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RefreshStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { safeEqual, sha256 } from '../common/utils/crypto.util';

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface RefreshJwtPayload {
  sub: string;
  sid: string; // session id (RefreshToken.sessionId)
  typ: 'refresh';
}

/**
 * Owns the whole session lifecycle: issue, rotate, revoke.
 * Only a SHA-256 digest of each refresh token is persisted.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger('Sessions');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private get refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? 'dev-only-secret';
  }

  private get refreshTtlMs(): number {
    const raw = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
    const match = /^(\d+)([smhd])$/.exec(raw.trim());
    if (!match) return 7 * 24 * 3600 * 1000;
    const value = Number(match[1]);
    const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
    return value * (unit ?? 86_400_000);
  }

  private async mint(userId: string, meta: SessionMeta) {
    const session = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: 'pending',
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
      },
    });

    const payload: RefreshJwtPayload = { sub: userId, sid: session.sessionId, typ: 'refresh' };
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    });

    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { tokenHash: sha256(refreshToken) },
    });

    return { session, refreshToken };
  }

  async issuePair(
    userId: string,
    accessPayload: object,
    meta: SessionMeta = {},
  ): Promise<IssuedTokens> {
    const { refreshToken } = await this.mint(userId, meta);
    const expiresIn = process.env.JWT_EXPIRES_IN ?? '15m';
    const accessToken = await this.jwt.signAsync(
      { ...accessPayload },
      { secret: process.env.JWT_SECRET, expiresIn },
    );
    return { accessToken, refreshToken, expiresIn };
  }

  /** Verifies the presented refresh token and returns its session row. */
  private async resolve(token: string) {
    let payload: RefreshJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshJwtPayload>(token, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('جلسة غير صالحة');
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException('جلسة غير صالحة');

    const session = await this.prisma.refreshToken.findUnique({
      where: { sessionId: payload.sid },
    });
    if (!session) throw new UnauthorizedException('جلسة غير صالحة');
    if (!safeEqual(session.tokenHash, sha256(token))) {
      throw new UnauthorizedException('جلسة غير صالحة');
    }
    return { session, payload };
  }

  /** Rotation: the old token is consumed and a brand-new pair is issued. */
  async rotate(
    token: string,
    accessPayload: object,
    meta: SessionMeta = {},
  ): Promise<IssuedTokens> {
    const { session, payload } = await this.resolve(token);

    // Re-use of an already rotated/revoked token => treat the family as compromised.
    if (session.status !== RefreshStatus.ACTIVE) {
      await this.revokeAll(payload.sub, 'token_reuse_detected');
      this.logger.warn(`refresh token reuse detected for user ${payload.sub}`);
      throw new UnauthorizedException('جلسة غير صالحة');
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('انتهت صلاحية الجلسة');
    }

    const { session: fresh, refreshToken } = await this.mint(payload.sub, meta);
    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: {
        status: RefreshStatus.USED,
        revokedAt: new Date(),
        replacedBySessionId: fresh.sessionId,
      },
    });

    const expiresIn = process.env.JWT_EXPIRES_IN ?? '15m';
    const accessToken = await this.jwt.signAsync(
      { ...accessPayload },
      { secret: process.env.JWT_SECRET, expiresIn },
    );
    return { accessToken, refreshToken, expiresIn };
  }

  async revoke(token: string): Promise<void> {
    const { session } = await this.resolve(token);
    if (session.status === RefreshStatus.ACTIVE) {
      await this.prisma.refreshToken.update({
        where: { id: session.id },
        data: { status: RefreshStatus.REVOKED, revokedAt: new Date() },
      });
    }
  }

  async revokeAll(userId: string, _reason = 'logout_all'): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, status: RefreshStatus.ACTIVE },
      data: { status: RefreshStatus.REVOKED, revokedAt: new Date() },
    });
    return result.count;
  }

  countActive(userId: string) {
    return this.prisma.refreshToken.count({ where: { userId, status: RefreshStatus.ACTIVE } });
  }

  listActive(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId, status: RefreshStatus.ACTIVE },
      select: { sessionId: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
