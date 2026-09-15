import { ForbiddenException } from '@nestjs/common';
import { WILDCARD_PERMISSION } from '../roles.constants';

/** Permission set carried by the current access token / request. */
export interface ActorAccess {
  id: string;
  roles: string[];
  permissions: string[];
}

const asSet = (values: string[] | undefined): Set<string> => new Set(values ?? []);

/** OWNER carries the wildcard. */
export const isOwner = (actor: Pick<ActorAccess, 'roles'>): boolean =>
  (actor.roles ?? []).includes('OWNER');

export const hasWildcard = (actor: Pick<ActorAccess, 'permissions'>): boolean =>
  asSet(actor.permissions).has(WILDCARD_PERMISSION);

/** Effective permissions = union of all role permissions (wildcard honoured). */
export const hasPermission = (actor: Pick<ActorAccess, 'permissions'>, key: string): boolean => {
  const perms = asSet(actor.permissions);
  return perms.has(WILDCARD_PERMISSION) || perms.has(key);
};

export const hasAnyPermission = (
  actor: Pick<ActorAccess, 'permissions'>,
  keys: string[],
): boolean => keys.some((key) => hasPermission(actor, key));

export const actorCan = (actor: ActorAccess, keys: string[]): boolean => {
  if (!keys.length) return true;
  if (hasWildcard(actor)) return true;
  const perms = asSet(actor.permissions);
  return keys.every((key) => perms.has(key));
};

/**
 * Privilege-escalation guard: an actor may only grant permissions they already
 * hold, unless they are an OWNER (wildcard).
 */
export const assertCanGrantPermissions = (
  actor: ActorAccess,
  permissionKeys: string[],
  context = 'منح الصلاحيات',
): void => {
  if (hasWildcard(actor) || isOwner(actor)) return;
  const perms = asSet(actor.permissions);
  const missing = permissionKeys.filter((key) => !perms.has(key));
  if (missing.length) {
    throw new ForbiddenException(
      `${context}: لا تملك الصلاحيات التالية لمنحها (${missing.slice(0, 5).join(', ')})`,
    );
  }
};

/** Builds the actor view from the JWT payload used by the existing guards. */
export const actorFromPayload = (user: {
  sub: string;
  roles?: string[];
  permissions?: string[];
}): ActorAccess => ({
  id: user.sub,
  roles: user.roles ?? [],
  permissions: user.permissions ?? [],
});
