import { SetMetadata } from '@nestjs/common';

export interface PermissionRequirement {
  // any of these permissions grants access
  any?: string[];
  // all of these permissions required
  all?: string[];
}

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

/** Role names are plain strings (custom roles supported) — see common/roles.constants. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const Permissions = (req: PermissionRequirement) =>
  SetMetadata(PERMISSIONS_KEY, req);
