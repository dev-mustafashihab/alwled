import { SetMetadata } from '@nestjs/common';
import { RoleName } from '@prisma/client';

export interface PermissionRequirement {
  // any of these permissions grants access
  any?: string[];
  // all of these permissions required
  all?: string[];
}

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export const Permissions = (req: PermissionRequirement) =>
  SetMetadata(PERMISSIONS_KEY, req);
