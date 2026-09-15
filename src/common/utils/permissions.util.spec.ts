import { ForbiddenException } from '@nestjs/common';
import {
  assertCanGrantPermissions,
  hasPermission,
  hasWildcard,
  isOwner,
  ActorAccess,
} from './permissions.util';

const actor = (over: Partial<ActorAccess> = {}): ActorAccess => ({
  id: 'u1',
  roles: ['EMPLOYEE'],
  permissions: ['orders.read', 'customers.read'],
  ...over,
});

describe('permissions.util', () => {
  it('treats OWNER as wildcard', () => {
    expect(isOwner(actor({ roles: ['OWNER'] }))).toBe(true);
    expect(hasWildcard(actor({ permissions: ['*'] }))).toBe(true);
  });

  it('hasPermission honours wildcard and exact keys', () => {
    expect(hasPermission(actor({ permissions: ['*'] }), 'roles.delete')).toBe(true);
    expect(hasPermission(actor(), 'orders.read')).toBe(true);
    expect(hasPermission(actor(), 'roles.delete')).toBe(false);
  });

  it('allows granting permissions the actor already holds', () => {
    expect(() => assertCanGrantPermissions(actor(), ['orders.read', 'customers.read'])).not.toThrow();
  });

  it('blocks privilege escalation when granting a permission the actor lacks', () => {
    expect(() => assertCanGrantPermissions(actor(), ['orders.read', 'roles.create'])).toThrow(
      ForbiddenException,
    );
  });

  it('lets OWNER grant anything', () => {
    expect(() =>
      assertCanGrantPermissions(actor({ roles: ['OWNER'], permissions: ['*'] }), ['roles.create']),
    ).not.toThrow();
  });
});
