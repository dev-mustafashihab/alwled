import { RoleName } from '@prisma/client';

/** Central constants for the Alwled backend. */
export const PASSWORD_MIN_LENGTH = 8;

/** Base permission set. Extended in stage 2 with user-management permissions. */
export const PERMISSION_KEYS = {
  dashboard: ['dashboard.read'],
  products: ['products.read', 'products.create', 'products.update', 'products.delete'],
  orders: ['orders.read', 'orders.update'],
  customers: ['customers.read', 'customers.update'],
  employees: ['employees.read', 'employees.create', 'employees.update', 'employees.delete'],
  users: ['users.read', 'users.update'],
  audit: ['audit.read'],
} as const;

export const ALL_PERMISSION_KEYS: string[] = Object.values(PERMISSION_KEYS).flat();

/** Role → permission matrix used by the seed (DB is the source of truth at runtime). */
export const ROLE_PERMISSION_MATRIX: Record<RoleName, string[]> = {
  OWNER: ['*'],
  ADMIN: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update',
    'orders.read', 'orders.update',
    'customers.read', 'customers.update',
    'employees.read', 'employees.create', 'employees.update',
    'users.read', 'users.update',
    'audit.read',
  ],
  EMPLOYEE: ['products.read', 'orders.read', 'orders.update', 'customers.read'],
  CUSTOMER: [],
};

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

/** Token lifetimes (seconds unless noted). */
export const TOKEN_TTL = {
  passwordResetMinutes: num('PASSWORD_RESET_TTL_MINUTES', 30),
  verificationMinutes: num('VERIFICATION_TTL_MINUTES', 15),
};

export const PUBLIC_USER_SELECT = {
  id: true, firstName: true, lastName: true, email: true, phone: true,
  status: true, isVerified: true, lastLoginAt: true, createdAt: true,
  roles: { select: { role: { select: { name: true } } } },
} as const;
