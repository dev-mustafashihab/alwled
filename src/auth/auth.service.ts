import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from '../common/decorators';
import { PUBLIC_USER_SELECT, TOKEN_TTL } from '../common/constants';
import { generateOpaqueToken, sha256 } from '../common/utils/crypto.util';
import { SessionService, SessionMeta } from './session.service';
import { VerificationService } from './verification/verification.service';
import { VerificationChannel } from '@prisma/client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

type RoleBinding = { role: { name: string; permissions: Array<{ permission: { key: string } }> } };

const USER_WITH_ACCESS = {
  roles: {
    include: {
      role: {
        include: { permissions: { include: { permission: { select: { key: true } } } } },
      },
    },
  },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly verification: VerificationService,
    private readonly audit: AuditService,
  ) {}

  /** Business rule: public registration can only ever create a CUSTOMER. */
  async register(dto: RegisterDto, meta: SessionMeta = {}) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('كلمتا المرور غير متطابقتين');
    }
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('البريد الإلكتروني أو رقم الهاتف مطلوب');
    }

    const or: Array<Record<string, string>> = [];
    if (dto.email) or.push({ email: dto.email.toLowerCase().trim() });
    if (dto.phone) or.push({ phone: dto.phone.trim() });
    const existing = await this.prisma.user.findFirst({ where: { OR: or }, select: { email: true, phone: true } });
    if (existing) {
      if (existing.email && dto.email && existing.email === dto.email.toLowerCase().trim()) {
        throw new ConflictException('البريد الإلكتروني مستخدم مسبقاً');
      }
      throw new ConflictException('رقم الهاتف مستخدم مسبقاً');
    }

    const customerRole = await this.prisma.role.findUniqueOrThrow({ where: { name: 'CUSTOMER' } });
    const passwordHash = await argon.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email ? dto.email.toLowerCase().trim() : null,
        phone: dto.phone.trim(),
        passwordHash,
        // isVerified stays false — verification workflow handles it later
        roles: { create: [{ roleId: customerRole.id }] },
      },
      include: USER_WITH_ACCESS,
    });

    await this.audit.log({
      action: AUDIT.USER_REGISTERED,
      actorId: user.id,
      entity: 'user',
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    // Verification foundation: issue a code without assuming delivery provider.
    let verificationIssued = false;
    try {
      await this.verification.issue(user.id, user.phone ?? user.email, VerificationChannel.OTP);
      verificationIssued = true;
    } catch {
      verificationIssued = false;
    }

    const tokens = await this.issueFor(user.id, user.roles as RoleBinding[], meta);
    return { ...tokens, verificationIssued };
  }

  async login(dto: LoginDto, meta: SessionMeta = {}) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('البريد الإلكتروني أو رقم الهاتف مطلوب');
    }
    const where = dto.email
      ? { email: dto.email.toLowerCase().trim() }
      : { phone: dto.phone!.trim() };

    const user = await this.prisma.user.findFirst({ where, include: USER_WITH_ACCESS });
    // Generic message: never reveal whether the account exists.
    if (!user) {
      await this.audit.log({
        action: AUDIT.USER_LOGIN_FAILED,
        entity: 'user',
        metadata: { reason: 'unknown_account' },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const passwordOk = await argon.verify(user.passwordHash, dto.password).catch(() => false);
    if (!passwordOk) {
      await this.audit.log({
        action: AUDIT.USER_LOGIN_FAILED,
        actorId: user.id,
        entity: 'user',
        entityId: user.id,
        metadata: { reason: 'bad_password' },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (user.status !== 'ACTIVE') {
      await this.audit.log({
        action: AUDIT.USER_LOGIN_FAILED,
        actorId: user.id,
        entity: 'user',
        entityId: user.id,
        metadata: { reason: `status_${user.status}` },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new ForbiddenException('الحساب غير مفعّل');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.log({
      action: AUDIT.USER_LOGIN,
      actorId: user.id,
      entity: 'user',
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.issueFor(user.id, user.roles as RoleBinding[], meta);
  }

  async refresh(refreshToken: string, meta: SessionMeta = {}): Promise<AuthTokens> {
    const { sub } = await this.decodeRefreshSubject(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: sub }, include: USER_WITH_ACCESS });
    if (!user) throw new UnauthorizedException('جلسة غير صالحة');
    if (user.status !== 'ACTIVE') {
      await this.sessions.revokeAll(user.id, 'account_not_active');
      throw new ForbiddenException('الحساب غير مفعّل');
    }
    try {
      return await this.sessions.rotate(refreshToken, this.payloadFor(user.id, user.roles as RoleBinding[], user), meta);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.audit.log({
          action: AUDIT.TOKEN_REUSE_DETECTED,
          actorId: sub,
          entity: 'user',
          entityId: sub,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      }
      throw error;
    }
  }

  async logout(refreshToken: string, userId?: string, meta: SessionMeta = {}) {
    await this.sessions.revoke(refreshToken);
    await this.audit.log({
      action: AUDIT.USER_LOGOUT,
      actorId: userId,
      entity: 'user',
      entityId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { loggedOut: true };
  }

  async logoutAll(userId: string, meta: SessionMeta = {}) {
    const revoked = await this.sessions.revokeAll(userId, 'logout_all');
    await this.audit.log({
      action: AUDIT.USER_LOGOUT_ALL,
      actorId: userId,
      entity: 'user',
      entityId: userId,
      metadata: { revoked },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { revokedSessions: revoked };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, meta: SessionMeta = {}) {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('كلمتا المرور الجديدتان غير متطابقتين');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!ok) throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    if (await argon.verify(user.passwordHash, dto.newPassword).catch(() => false)) {
      throw new BadRequestException('لا يمكن إعادة استخدام كلمة المرور الحالية');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon.hash(dto.newPassword) },
    });
    const revoked = await this.sessions.revokeAll(userId, 'password_changed');
    await this.audit.log({
      action: AUDIT.PASSWORD_CHANGED,
      actorId: userId,
      entity: 'user',
      entityId: userId,
      metadata: { revokedSessions: revoked },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { changed: true, revokedSessions: revoked };
  }

  /**
   * Always returns the same generic payload so account existence is never leaked.
   * The reset token is returned only outside production (delivery provider lands later).
   */
  async forgotPassword(identifier: { email?: string; phone?: string }, meta: SessionMeta = {}) {
    const where = identifier.email
      ? { email: identifier.email.toLowerCase().trim() }
      : identifier.phone
        ? { phone: identifier.phone.trim() }
        : null;
    const generic = { message: 'إذا كان الحساب موجوداً فسيتم إرسال رمز إعادة التعيين' };
    if (!where) return generic;

    const user = await this.prisma.user.findFirst({ where });
    if (!user || user.status === 'DELETED') return generic;

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateOpaqueToken(48);
    const expiresAt = new Date(Date.now() + TOKEN_TTL.passwordResetMinutes * 60_000);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt },
    });
    await this.audit.log({
      action: AUDIT.PASSWORD_RESET_REQUESTED,
      actorId: user.id,
      entity: 'user',
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return process.env.NODE_ENV === 'production'
      ? generic
      : { ...generic, devToken: token, expiresAt };
  }

  async resetPassword(dto: ResetPasswordDto, meta: SessionMeta = {}) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('كلمتا المرور غير متطابقتين');
    }
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(dto.token) },
      include: { user: { select: { id: true, status: true } } },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException('رمز إعادة التعيين غير صالح أو منتهي');
    }
    if (row.user.status === 'DELETED') throw new BadRequestException('الحساب غير متاح');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await argon.hash(dto.newPassword) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
    ]);

    const revoked = await this.sessions.revokeAll(row.userId, 'password_reset');
    await this.audit.log({
      action: AUDIT.PASSWORD_RESET,
      actorId: row.userId,
      entity: 'user',
      entityId: row.userId,
      metadata: { revokedSessions: revoked },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { reset: true, revokedSessions: revoked };
  }

  async resendVerification(userId: string, channel?: VerificationChannel, meta: SessionMeta = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isVerified: true, phone: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (user.isVerified) throw new BadRequestException('الحساب موثّق مسبقاً');

    const recent = await this.verification.countRecent(user.id, 10);
    if (recent >= 5) {
      throw new BadRequestException('تم إرسال عدد كبير من الرموز، حاول لاحقاً');
    }

    const issued = await this.verification.issue(
      user.id,
      user.phone ?? user.email,
      channel ?? VerificationChannel.OTP,
    );
    await this.audit.log({
      action: AUDIT.VERIFICATION_SENT,
      actorId: user.id,
      entity: 'user',
      entityId: user.id,
      metadata: { channel: issued.channel },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    const base = { sent: true, channel: issued.channel, expiresAt: issued.expiresAt };
    return process.env.NODE_ENV === 'production' ? base : { ...base, devToken: issued.token };
  }

  async verifyAccount(userId: string, token: string, meta: SessionMeta = {}) {
    const row = await this.verification.consume(token);
    if (row.userId !== userId) throw new BadRequestException('رمز التحقق لا يخص هذا الحساب');
    await this.prisma.user.update({ where: { id: userId }, data: { isVerified: true } });
    await this.audit.log({
      action: AUDIT.VERIFICATION_COMPLETED,
      actorId: userId,
      entity: 'user',
      entityId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { verified: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...PUBLIC_USER_SELECT, status: true, updatedAt: true },
    });
    if (!user) throw new UnauthorizedException('جلسة غير صالحة');
    return {
      ...user,
      roles: user.roles.map((r) => r.role.name),
      isActive: user.status === 'ACTIVE',
    };
  }

  async listSessions(userId: string) {
    const [active, tokens] = await Promise.all([
      this.sessions.countActive(userId),
      this.sessions.listActive(userId),
    ]);
    return { activeSessions: active, sessions: tokens };
  }

  /* ----------------------------- helpers ----------------------------- */

  private payloadFor(userId: string, bindings: RoleBinding[], user: { id: string }): JwtPayload {
    const roles = bindings.map((b) => b.role.name);
    const permissions = new Set<string>();
    bindings.forEach((b) => b.role.permissions.forEach((p) => permissions.add(p.permission.key)));
    if (roles.includes('OWNER')) permissions.add('*');
    return { sub: userId, roles, permissions: Array.from(permissions) };
  }

  private async issueFor(
    userId: string,
    bindings: RoleBinding[],
    meta: SessionMeta,
  ): Promise<AuthTokens> {
    const payload = this.payloadFor(userId, bindings, { id: userId });
    return this.sessions.issuePair(userId, { ...payload }, meta);
  }

  private async decodeRefreshSubject(token: string): Promise<{ sub: string }> {
    try {
      const decoded = JSON.parse(
        Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
      ) as { sub?: string };
      if (!decoded.sub) throw new Error('no sub');
      return { sub: decoded.sub };
    } catch {
      throw new UnauthorizedException('جلسة غير صالحة');
    }
  }
}
