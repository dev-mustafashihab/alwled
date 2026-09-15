import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtStrategy } from './strategies/jwt.strategy';
import type { PrismaService } from '../database/prisma.service';

const makePrisma = (user: unknown) =>
  ({ user: { findUnique: jest.fn().mockResolvedValue(user) } }) as unknown as PrismaService;

describe('JwtStrategy', () => {
  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
  });

  it('returns live roles and permissions for an active user', async () => {
    const prisma = makePrisma({
      id: 'u1',
      status: 'ACTIVE',
      roles: [
        {
          role: {
            name: 'ADMIN',
            permissions: [{ permission: { key: 'users.read' } }],
          },
        },
      ],
    });
    const strategy = new JwtStrategy(prisma);
    const result = await strategy.validate({ sub: 'u1', roles: [] });
    expect(result.sub).toBe('u1');
    expect(result.roles).toEqual(['ADMIN']);
    expect(result.permissions).toEqual(['users.read']);
  });

  it('grants the wildcard to OWNER', async () => {
    const prisma = makePrisma({
      id: 'owner',
      status: 'ACTIVE',
      roles: [{ role: { name: 'OWNER', permissions: [] } }],
    });
    const result = await new JwtStrategy(prisma).validate({ sub: 'owner', roles: [] });
    expect(result.permissions).toContain('*');
  });

  it('rejects tokens for disabled accounts', async () => {
    const prisma = makePrisma({
      id: 'u2',
      status: 'SUSPENDED',
      roles: [],
    });
    await expect(new JwtStrategy(prisma).validate({ sub: 'u2', roles: [] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects deleted/unknown accounts', async () => {
    await expect(
      new JwtStrategy(makePrisma(null)).validate({ sub: 'ghost', roles: [] }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects payloads without sub', async () => {
    await expect(
      new JwtStrategy(makePrisma(null)).validate({ roles: [] } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
