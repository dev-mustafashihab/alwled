import { ForbiddenException } from '@nestjs/common';
import { EmployeesService } from './employees.service';

/**
 * Deterministic coverage of the "last OWNER" guard rails.
 * In the live API these branches are additionally shielded by the
 * self-modification and owner-only rules, so they are exercised here with
 * mocked dependencies where the owner count can be controlled exactly.
 */
describe('EmployeesService — last owner protection', () => {
  const ownerId = 'owner-1';
  const ownerRole = { id: 1, name: 'OWNER' };

  const build = (ownersCount: number) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: ownerId,
          status: 'ACTIVE',
          roles: [{ role: ownerRole }],
        }),
        count: jest.fn().mockResolvedValue(ownersCount),
        update: jest.fn(),
      },
      role: { findUnique: jest.fn().mockResolvedValue(ownerRole) },
      userRole: { delete: jest.fn() },
    };
    const sessions = { revokeAll: jest.fn().mockResolvedValue(0) };
    const audit = { log: jest.fn() };
    const service = new EmployeesService(prisma as never, sessions as never, audit as never);
    return { service, prisma, sessions, audit };
  };

  const actor = { id: 'owner-2', roles: ['OWNER'], permissions: ['*'] };

  it('refuses to disable the last remaining OWNER', async () => {
    const { service, prisma } = build(1);
    await expect(service.setStatus(ownerId, false, actor)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to revoke the OWNER role from the last OWNER', async () => {
    const { service, prisma } = build(1);
    prisma.user.findUnique = jest.fn().mockResolvedValue({
      id: ownerId,
      status: 'ACTIVE',
      roles: [
        { role: ownerRole },
        { role: { id: 3, name: 'EMPLOYEE' } },
      ],
    });
    await expect(service.revokeRole(ownerId, ownerRole.id, actor)).rejects.toThrow(ForbiddenException);
  });

  it('refuses self status change', async () => {
    const { service } = build(3);
    await expect(service.setStatus('owner-2', false, actor)).rejects.toThrow();
  });

  it('allows disabling a non-last OWNER (two owners exist)', async () => {
    const { service, prisma, sessions } = build(2);
    prisma.user.update = jest.fn().mockResolvedValue({
      id: ownerId,
      status: 'SUSPENDED',
      roles: [{ assignedAt: new Date(), role: { ...ownerRole, isSystem: true } }],
    });
    const result = await service.setStatus(ownerId, false, actor);
    expect(sessions.revokeAll).toHaveBeenCalledWith(ownerId, 'employee_disabled');
    expect(result).toMatchObject({ status: 'SUSPENDED' });
  });
});
