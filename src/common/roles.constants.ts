/**
 * System roles: seeded, protected from deletion, and used for hard security rules.
 * Custom roles (SALES, PRODUCT_MANAGER, ...) live in the same table with isSystem=false.
 */
export const SystemRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
  CUSTOMER: 'CUSTOMER',
} as const;

export type SystemRoleName = (typeof SystemRole)[keyof typeof SystemRole];

export const SYSTEM_ROLE_NAMES: string[] = Object.values(SystemRole);

/** Roles that make an account a staff account (not a store customer). */
export const STAFF_ROLE_NAMES: string[] = [SystemRole.OWNER, SystemRole.ADMIN, SystemRole.EMPLOYEE];

/** Roles that only an OWNER may grant or revoke. */
export const OWNER_ONLY_ROLE_NAMES: string[] = [SystemRole.OWNER, SystemRole.ADMIN];

export const WILDCARD_PERMISSION = '*';

/** Names reserved for system use — custom roles may not use them. */
export const RESERVED_ROLE_NAMES: string[] = SYSTEM_ROLE_NAMES;
