import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/decorators';
import { ROLE_PERMISSIONS } from './roles.seed';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async hash(token: string): Promise<string> {
    return argon.hash(token);
  }

  async register(dto: RegisterDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('email or phone is required');
    }
    const where = dto.email
      ? { email: dto.email }
      : { phone: dto.phone };
    const exists = await this.prisma.user.findFirst({ where });
    if (exists) throw new ConflictException('User already exists');

    const passwordHash = await argon.hash(dto.password);
    const role = await this.prisma.role.findUniqueOrThrow({
      where: { name: 'CUSTOMER' },
    });
    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        roles: { create: [{ roleId: role.id }] },
      },
    });
    return this.issueTokens(this.toPayload(user, ['CUSTOMER']));
  }

  async login(dto: LoginDto) {
    const where = dto.email
      ? { email: dto.email }
      : dto.phone
        ? { phone: dto.phone }
        : null;
    if (!where) throw new BadRequestException('email or phone is required');
    const user = await this.prisma.user.findFirst({
      where,
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await argon.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const roles = user.roles.map((ur) => ur.role.name);
    const permissions = this.derivePermissions(user);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      roles,
      permissions,
    };
    return this.issueTokens(payload);
  }

  private deriveUserPermissions(
    roleBindings: Array<{ role: { permissions: Array<{ permission: { key: string } }> } }>,
  ): string[] {
    const perms = new Set<string>();
    roleBindings.forEach((rb) =>
      rb.role.permissions.forEach((rp) => perms.add(rp.permission.key)),
    );
    return Array.from(perms);
  }

  private derivePermissions(user: {
    roles: Array<{ role: { permissions: Array<{ permission: { key: string } }> } }>;
  }): string[] {
    return this.deriveUserPermissions(user.roles);
  }

  private toPayload(user: any, roles: string[]): JwtPayload {
    return { sub: user.id, email: user.email, phone: user.phone, roles };
  }

  private async signAccess(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  private async signRefresh(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    });
  }

  private async auditLoginMeta() {
    // placeholder for audit logging in later stages
  }

  private async issueTokens(payload: JwtPayload) {
    const accessToken = await this.signAccess(payload);
    const refreshToken = await this.signRefresh(payload);
    // store only a hash of refresh token
    const tokenHash = await this.hash(refreshToken);
    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  private async issueTokens2(payload: JwtPayload) {
    return this.issueTokens(payload);
  }

  private deriveUserPermissionsFromRoles(roleNames: string[]): string[] {
    const perms = new Set<string>();
    roleNames.forEach((rn) => {
      const list = ROLE_PERMISSIONS[rn as keyof typeof ROLE_PERMISSIONS];
      (list ?? []).forEach((p) => perms.add(p));
      if (rn === 'OWNER') perms.add('*');
    });
    return Array.from(perms);
  }

  async validateUser(userId: string): Promise<JwtPayload | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.status !== 'ACTIVE') return null;
    const roles = user.roles.map((r) => r.role.name);
    return this.toPayload(user, roles);
  }

  async refresh(token: string) {
    const rows = await this.prisma.refreshToken.findMany({ where: { status: 'ACTIVE' } });
    let matched: typeof rows[number] | null = null;
    for (const row of rows) {
      if (await argon.verify(row.tokenHash, token)) {
        matched = row;
        break;
      }
    }
    if (!matched || matched.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // rotation: mark used and issue a new pair
    await this.prisma.refreshToken.update({
      where: { id: matched.id },
      data: { status: 'USED' },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: matched.userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
    const roleNames = user.roles.map((r) => r.role.name);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      roles: roleNames,
      permissions: this.deriveUserPermissionsFromRoles(roleNames),
    };
    return this.issueTokens(payload);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        isVerified: true,
        createdAt: true,
        roles: { include: { role: { select: { name: true } } } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
