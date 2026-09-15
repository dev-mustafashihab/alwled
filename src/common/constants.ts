/** Central constants for the Alwled backend. */
export const PASSWORD_MIN_LENGTH = 8;

/** Base permission set (stage 1: architecture). Extend as modules land. */
export const PERMISSION_KEYS = {
  dashboard: ['dashboard.read'],
  products: ['products.read', 'products.create', 'products.update', 'products.delete'],
  orders: ['orders.read', 'orders.update'],
  customers: ['customers.read', 'customers.update'],
  employees: ['employees.read', 'employees.create', 'employees.update', 'employees.delete'],
} as const;
