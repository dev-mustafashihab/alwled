const path = require('path');

const load = (relative) => require(path.join(__dirname, '..', 'assets', 'js', relative));

describe('permissions — بوابة الواجهة (ليست حماية)', () => {
  const permissions = load('core/permissions.js');

  it('grants nothing without a permission list', () => {
    const empty = permissions.create(undefined, undefined);
    expect(empty.has('products.read')).toBe(false);
    expect(empty.hasAny(['products.read', 'products.create'])).toBe(false);
    expect(empty.wildcard).toBe(false);
  });

  it('treats "*" as the owner wildcard', () => {
    const owner = permissions.create(['*'], ['OWNER']);
    expect(owner.wildcard).toBe(true);
    expect(owner.has('anything.at.all')).toBe(true);
    expect(owner.hasAny(['a', 'b'])).toBe(true);
    expect(owner.hasAll(['a', 'b'])).toBe(true);
  });

  it('checks permissions, never role names', () => {
    const employee = permissions.create(['orders.read'], ['EMPLOYEE']);
    expect(employee.has('orders.read')).toBe(true);
    expect(employee.has('orders.update')).toBe(false);
    // being an employee does not imply admin-like access
    expect(employee.has('dashboard.read')).toBe(false);
    expect(employee.hasAll(['orders.read', 'orders.update'])).toBe(false);
    expect(employee.hasAny(['orders.update', 'orders.read'])).toBe(true);
  });

  it('handles empty key lists as "no restriction" for hasAny/hasAll', () => {
    const customer = permissions.create([], ['CUSTOMER']);
    expect(customer.hasAny([])).toBe(true);
    expect(customer.hasAll([])).toBe(true);
    expect(customer.has('')).toBe(false);
    expect(customer.has(null)).toBe(false);
  });

  it('reports the role label for display only', () => {
    expect(permissions.create(['a'], ['ADMIN', 'EMPLOYEE']).label()).toBe('ADMIN، EMPLOYEE');
    expect(permissions.create([], []).label()).toBe('—');
  });
});

describe('session — تخزين التوكنات', () => {
  let session;
  let store;

  beforeEach(() => {
    jest.resetModules();
    store = (() => {
      const map = new Map();
      return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key),
      };
    })();
    global.localStorage = store;
    session = load('core/session.js');
    session._resetForTests();
  });

  afterEach(() => {
    delete global.localStorage;
  });

  it('keeps the access token in memory only', () => {
    session.start({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900, remember: true });
    expect(session.getAccess()).toBe('access-1');
    const stored = JSON.parse(store.getItem(session.STORAGE_KEY));
    expect(stored.accessToken).toBeUndefined(); // never persisted
    expect(stored.refreshToken).toBe('refresh-1');
    expect(session.isRemembered()).toBe(true);
  });

  it('drops the in-memory access token on clear/expire but keeps listeners working', () => {
    const events = [];
    session.on((event) => events.push(event));
    session.start({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    session.expire();
    expect(session.getAccess()).toBeNull();
    expect(session.getRefresh()).toBeNull();
    expect(events).toEqual(['started', 'expired']);
  });

  it('survives a broken storage implementation', () => {
    global.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => session.start({ accessToken: 'a', refreshToken: 'b' })).not.toThrow();
    expect(session.getAccess()).toBe('a');
    expect(session.getRefresh()).toBeNull();
  });
});

describe('config — عنوان الـAPI', () => {
  it('builds API URLs and applies URL overrides without leaking secrets', () => {
    const config = load('core/config.js');
    config.saveOverrides({ apiBaseUrl: 'https://api.example.com/api/v1/' });
    expect(config.apiUrl('/orders')).toBe('https://api.example.com/api/v1/orders');
    config.applyDocumentOverrides({ body: { getAttribute: () => null } }, '?api=%2Fapi%2Fv1');
    expect(config.apiBaseUrl).toBe('/api/v1');
    expect(config.apiUrl('orders')).toBe('/api/v1/orders');
    // no credential-like keys may be configured from the UI layer
    const keys = Object.keys(config);
    expect(keys.filter((key) => /secret|password|token/i.test(key))).toEqual([]); // no credential slot in the UI config
    config.reset();
  });
});
