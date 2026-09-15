import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtStrategy } from './strategies/jwt.strategy';
import type { PrismaService } from '../database/prisma.service';
import { ActorService } from '../common/services/actor.service';

const makePrisma = (user: unknown) =>
  ({ user: { findUnique: jest.fn().mockResolvedValue(user) } }) as unknown as PrismaService;

/** Stage 3+: JwtStrategy delegates identity resolution to ActorService. */
const makeStrategy = (user: unknown) =>
  new JwtStrategy(new ActorService(makePrisma(user)));

describe('JwtStrategy', () => {
  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
  });

  it('returns live roles and permissions for an active user', async () => {
    const strategy = makeStrategy({
      id: 'u1',
      status: 'ACTIVE',
      roles: [{ role: { name: 'ADMIN', permissions: [{ permission: { key: 'users.read' } }] } }],
    });
    const result = await strategy.validate({ sub: 'u1', roles: [] });
    expect(result.sub).toBe('u1');
    expect(result.roles).toEqual(['ADMIN']);
    expect(result.permissions).toEqual(['users.read']);
  });

  it('grants the wildcard to OWNER', async () => {
    const result = await makeStrategy({
      id: 'owner', status: 'ACTIVE',
      roles: [{ role: { name: 'OWNER', permissions: [] } }],
    }).validate({ sub: 'owner', roles: [] });
    expect(result.permissions).toContain('*');
  });

  it('rejects tokens for disabled accounts', async () => {
    await expect(
      makeStrategy({ id: 'u2', status: 'SUSPENDED', roles: [] }).validate({ sub: 'u2', roles: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects deleted/unknown accounts', async () => {
    await expect(
      makeStrategy(null).validate({ sub: 'ghost', roles: [] }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects payloads without sub', async () => {
    await expect(
      makeStrategy(null).validate({ roles: [] } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
