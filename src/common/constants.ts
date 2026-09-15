/**
 * Central constants for the Alwled backend.
 * NOTE (stage 3): Role.name is a plain string in the schema, so custom roles
 * (SALES, PRODUCT_MANAGER, ...) can be created without a migration.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Permission catalogue — single source of truth for the seed and the guards. */
export const PERMISSION_KEYS = {
  system: ['*'],
  dashboard: ['dashboard.read'],
  products: ['products.read', 'products.create', 'products.update', 'products.delete'],
  categories: ['categories.read', 'categories.create', 'categories.update', 'categories.delete'],
  orders: ['orders.read', 'orders.create', 'orders.update', 'orders.cancel'],
  customers: ['customers.read', 'customers.update'],
  employees: [
    'employees.read', 'employees.create', 'employees.update', 'employees.delete',
  ],
  users: ['users.read', 'users.update'],
  roles: ['roles.read', 'roles.create', 'roles.update', 'roles.delete'],
  permissions: ['permissions.read'],
  payments: ['payments.read', 'payments.update'],
  audit: ['audit.read'],
} as const;

export const ALL_PERMISSION_KEYS: string[] = Object.values(PERMISSION_KEYS).flat();

/**
 * Role → permission matrix used by the seed. Keys are system role names.
 * The DB stays the runtime source of truth; this only defines seed defaults.
 */
export const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  OWNER: ['*'],
  ADMIN: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update', 'products.delete',
    'categories.read', 'categories.create', 'categories.update', 'categories.delete',
    'orders.read', 'orders.create', 'orders.update', 'orders.cancel',
    'customers.read', 'customers.update',
    'employees.read', 'employees.create', 'employees.update',
    'users.read', 'users.update',
    'roles.read',
    'permissions.read',
    'payments.read',
    'audit.read',
  ],
  EMPLOYEE: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update',
    'categories.read',
    'orders.read', 'orders.update',
    'customers.read',
  ],
  CUSTOMER: [],
};

/** Roles that are seeded and protected from deletion. */
export const SYSTEM_ROLES: string[] = ['OWNER', 'ADMIN', 'EMPLOYEE', 'CUSTOMER'];

/** Rate limits, overridable from env (window seconds / max requests). */
const num = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const RATE_LIMITS = {
  register: { window: num('RATE_REGISTER_WINDOW', 3600), max: num('RATE_REGISTER_MAX', 10) },
  login: { window: num('RATE_LOGIN_WINDOW', 300), max: num('RATE_LOGIN_MAX', 20) },
  forgot: { window: num('RATE_FORGOT_WINDOW', 900), max: num('RATE_FORGOT_MAX', 5) },
  reset: { window: num('RATE_RESET_WINDOW', 900), max: num('RATE_RESET_MAX', 10) },
  resendVerification: { window: num('RATE_RESEND_WINDOW', 300), max: num('RATE_RESEND_MAX', 3) },
  refresh: { window: num('RATE_REFRESH_WINDOW', 300), max: num('RATE_REFRESH_MAX', 60) },
} as const;

/** Token lifetimes (minutes). */
export const TOKEN_TTL = {
  passwordResetMinutes: num('PASSWORD_RESET_TTL_MINUTES', 30),
  verificationMinutes: num('VERIFICATION_TTL_MINUTES', 15),
};

/** Fields safe to expose for any user/employee payload. */
export const PUBLIC_USER_SELECT = {
  id: true, firstName: true, lastName: true, email: true, phone: true,
  status: true, isVerified: true, lastLoginAt: true, createdAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} as const;
