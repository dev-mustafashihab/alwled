/** Seed-role → permission keys mapping (mirrors permissions seeded into DB). */
export const ROLE_PERMISSIONS = {
  OWNER: ['*'],
  ADMIN: [
    'dashboard.read',
    'products.read',
    'products.create',
    'products.update',
    'orders.read',
    'orders.update',
    'customers.read',
    'customers.update',
    'employees.read',
  ],
  EMPLOYEE: ['products.read', 'orders.read', 'orders.update', 'customers.read'],
  CUSTOMER: [],
} as const;
