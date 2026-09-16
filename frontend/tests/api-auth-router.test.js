const path = require('path');

const load = (relative) => require(path.join(__dirname, '..', 'assets', 'js', relative));

function response(status, body, headers) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headers || {},
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
  };
}

describe('api — عميل مركزي', () => {
  let api;
  let calls;
  let handler;
  let session;

  beforeEach(() => {
    jest.resetModules();
    api = load('core/api.js');
    calls = [];
    handler = () => response(200, { success: true, data: { ok: true } });
    session = { access: 'token-1', getAccess: () => session.access, expire: jest.fn() };
    api.configure({
      fetchImpl: (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(handler(url, init, calls.length));
      },
      config: { apiUrl: (p) => '/api/v1' + p, requestTimeoutMs: 5000 },
      session,
      refresh: null,
      onUnauthorized: null,
    });
  });

  it('unwraps the {success,message,data} envelope', async () => {
    const data = await api.get('/products');
    expect(data).toEqual({ ok: true });
    expect(calls[0].url).toBe('/api/v1/products');
    expect(calls[0].init.method).toBe('GET');
  });

  it('attaches the bearer token from the session', async () => {
    await api.get('/orders');
    expect(calls[0].init.headers.Authorization).toBe('Bearer token-1');
  });

  it('builds query strings and drops empty values', async () => {
    await api.get('/orders', { query: { page: 1, limit: 20, status: '', extra: null, flag: false, list: ['a', 'b'] } });
    expect(calls[0].url).toBe('/api/v1/orders?page=1&limit=20&flag=false&list=a&list=b');
  });

  it('maps HTTP statuses to stable error codes with server messages', async () => {
    const cases = [
      [400, 'validation'],
      [422, 'validation'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'conflict'],
      [429, 'throttled'],
      [500, 'server'],
      [503, 'server'],
    ];
    for (const [status, code] of cases) {
      handler = () => response(status, { success: false, message: 'رسالة من الخادم' });
      await expect(api.get('/x')).rejects.toMatchObject({ code, status, message: 'رسالة من الخادم' });
    }
  });

  it('extracts field-level validation errors', async () => {
    handler = () => response(400, { success: false, message: 'Validation failed', errors: [{ field: 'name', message: 'مطلوب' }] });
    await expect(api.post('/products', {})).rejects.toMatchObject({
      code: 'validation',
      fields: [{ field: 'name', message: 'مطلوب' }],
    });
  });

  it('refreshes once on 401 and retries the original request', async () => {
    let refreshed = false;
    api.configure({
      refresh: () => {
        refreshed = true;
        session.access = 'token-2';
        return Promise.resolve(true);
      },
    });
    handler = (url, init, attempt) => (attempt === 1
      ? response(401, { success: false, message: 'انتهت الجلسة' })
      : response(200, { success: true, data: { retried: true } }));

    const data = await api.get('/orders');
    expect(refreshed).toBe(true);
    expect(data).toEqual({ retried: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].init.headers.Authorization).toBe('Bearer token-2');
  });

  it('expires the session and notifies when the refresh fails', async () => {
    const onUnauthorized = jest.fn();
    api.configure({ refresh: () => Promise.resolve(false), onUnauthorized });
    handler = () => response(401, { success: false, message: 'غير مصرح' });

    await expect(api.get('/orders')).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
    expect(session.expire).toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('never retries more than once (no refresh loops)', async () => {
    let refreshCount = 0;
    api.configure({
      refresh: () => {
        refreshCount += 1;
        return Promise.resolve(true);
      },
    });
    handler = () => response(401, { success: false, message: 'غير مصرح' });
    await expect(api.get('/orders')).rejects.toMatchObject({ code: 'unauthorized' });
    expect(refreshCount).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it('surfaces network failures as a friendly code', async () => {
    api.configure({
      fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await expect(api.get('/orders')).rejects.toMatchObject({ code: 'network', status: 0 });
  });

  it('does not send auth headers when skipAuth is set', async () => {
    await api.post('/auth/login', { phone: '0900', password: 'x' }, { skipAuth: true });
    expect(calls[0].init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(calls[0].init.body)).toEqual({ phone: '0900', password: 'x' });
  });

  it('maps all statuses deterministically', () => {
    expect(api.codeForStatus(400)).toBe('validation');
    expect(api.codeForStatus(401)).toBe('unauthorized');
    expect(api.codeForStatus(500)).toBe('server');
    expect(api.codeForStatus(418)).toBe('error');
  });
});

describe('auth — دورة حياة الجلسة', () => {
  let auth;
  let session;
  let apiMock;

  beforeEach(() => {
    jest.resetModules();
    const permissions = load('core/permissions.js');
    const store = load('core/store.js');
    global.ALW = { permissions, store };
    auth = load('core/auth.js');
    session = {
      access: null,
      refreshToken: null,
      started: [],
      getAccess() { return this.access; },
      getRefresh() { return this.refreshToken; },
      hasRefresh() { return !!this.refreshToken; },
      isRemembered() { return true; },
      start(payload) { this.access = payload.accessToken; this.refreshToken = payload.refreshToken; this.started.push(payload); },
      clear() { this.access = null; this.refreshToken = null; },
      setUser() {},
      expire() { this.access = null; this.refreshToken = null; },
    };
    apiMock = {
      calls: [],
      get: jest.fn(() => Promise.resolve({ id: 'u1', roles: ['ADMIN'], permissions: ['orders.read', 'dashboard.read'] })),
      post: jest.fn((path, body) => {
        apiMock.calls.push({ path, body });
        if (path === '/auth/login') {
          return Promise.resolve({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 900 });
        }
        if (path === '/auth/refresh') return Promise.resolve({ accessToken: 'a2', refreshToken: 'r2' });
        return Promise.resolve({});
      }),
      ApiError: (message, options) => Object.assign(new Error(message), options, { isApiError: true }),
    };
    auth.configure({ api: apiMock, session, permissionsFactory: permissions });
  });

  it('logs in, stores tokens (access in memory), and loads the effective permissions', async () => {
    const permissions = await auth.login({ identifier: '0938045496', password: 'secret', remember: true });
    expect(session.started[0]).toMatchObject({ accessToken: 'a1', refreshToken: 'r1', remember: true });
    expect(auth.isAuthenticated()).toBe(true);
    expect(permissions.has('orders.read')).toBe(true);
    expect(permissions.has('payments.update')).toBe(false);
    expect(auth.can('dashboard.read')).toBe(true);
  });

  it('keeps the UI anonymous when login fails and never fabricates permissions', async () => {
    apiMock.post = jest.fn(() => Promise.reject(Object.assign(new Error('رقم الهاتف أو كلمة المرور غير صحيحة'), { code: 'unauthorized' })));
    await expect(auth.login({ identifier: 'x', password: 'y' })).rejects.toThrow();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.can('products.read')).toBe(false);
    expect(auth.permissions().has('*')).toBe(false);
  });

  it('restores a session using the refresh token, then clears it if refresh fails', async () => {
    session.refreshToken = 'r1';
    await expect(auth.restore()).resolves.toBe(true);
    expect(auth.isAuthenticated()).toBe(true);

    apiMock.post = jest.fn(() => Promise.reject(new Error('invalid')));
    session.refreshToken = 'r-old';
    session.access = null; // force a refresh attempt (an in-memory token would short-circuit it)
    await expect(auth.restore()).resolves.toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(session.getRefresh()).toBeNull();
  });

  it('always clears the local session on logout, even if the server call fails', async () => {
    await auth.login({ identifier: '0938', password: 'x' });
    apiMock.post = jest.fn(() => Promise.reject(new Error('network')));
    await auth.logout(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(session.getAccess()).toBeNull();
    expect(session.getRefresh()).toBeNull();
  });
});

describe('router — التوجيه والحرّاس', () => {
  let router;
  beforeEach(() => {
    jest.resetModules();
    router = load('core/router.js');
  });

  it('parses and builds hashes with query params', () => {
    expect(router.parseHash('#/orders?page=2&status=PENDING')).toEqual({ path: '/orders', query: { page: '2', status: 'PENDING' } });
    expect(router.parseHash('')).toEqual({ path: '/', query: {} });
    expect(router.parseHash('#/payments/review/')).toEqual({ path: '/payments/review', query: {} });
    expect(router.buildHash('/products', { search: 'ثلاجة', page: 1, empty: '' })).toBe('#/products?search=%D8%AB%D9%84%D8%A7%D8%AC%D8%A9&page=1');
  });

  const routes = {
    '/login': { public: true },
    '/dashboard': { permission: 'dashboard.read' },
    '/products': { permission: 'products.read' },
  };

  it('routes an unauthenticated visitor to login (even for known routes)', () => {
    expect(router.resolve('/products', routes, { authenticated: false }).kind).toBe('login');
    expect(router.resolve('/', routes, { authenticated: false }).kind).toBe('login');
    expect(router.resolve('/login', routes, { authenticated: false }).kind).toBe('route');
  });

  it('blocks a route whose permission is missing and allows the ones granted', () => {
    const context = { authenticated: true, can: (key) => key === 'products.read' };
    expect(router.resolve('/products', routes, context).kind).toBe('route');
    expect(router.resolve('/dashboard', routes, context).kind).toBe('forbidden');
  });

  it('returns notfound for unknown paths instead of a blank screen', () => {
    expect(router.resolve('/nope', routes, { authenticated: true, can: () => true }).kind).toBe('notfound');
  });
});
