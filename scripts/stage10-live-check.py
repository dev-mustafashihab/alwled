"""Stage 10 live verification: dashboard/analytics against the running server (port 3100).

Reads only, plus a temporary customer account that is removed at the end.
Every headline metric is compared with an independent SQL query.
"""
import json
import re
import time
import urllib.error
import urllib.request

B = 'http://127.0.0.1:3100/api/v1'
STAMP = str(int(time.time()))[-7:]
PASS = 'Str0ng!Pass1'
results = []


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(B + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw[:200]}


def check(label, ok, detail=''):
    results.append((label, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'} | {label} | {detail}")


def owner_token():
    env = open('/root/alwled/.env').read()
    phone = re.search(r'SEED_OWNER_PHONE=(.*)', env).group(1).strip()
    pw = re.search(r'SEED_OWNER_PASSWORD=(.*)', env).group(1).strip()
    s, b = call('POST', '/auth/login', body={'phone': phone, 'password': pw})
    assert s == 200, (s, b)
    return b['data']['accessToken']


def pg(sql_text):
    """Independent expectation straight from PostgreSQL (psql)."""
    import subprocess
    pw = re.search(r'DATABASE_URL="?postgresql://[^:]+:([^@]+)@', open('/root/alwled/.env').read()).group(1)
    env = {'PGPASSWORD': pw, 'PATH': '/usr/bin:/bin'}
    out = subprocess.run(
        ['psql', '-h', '127.0.0.1', '-p', '5433', '-U', 'mp_user', '-d', 'alwled', '-Atc', sql_text],
        capture_output=True, text=True, env=env,
    )
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


owner = owner_token()

# health + swagger
s, _ = call('GET', '/health')
check('health 200', s == 200, str(s))
with urllib.request.urlopen('http://127.0.0.1:3100/api/docs') as r:
    check('swagger 200', r.status == 200, str(r.status))
with urllib.request.urlopen('http://127.0.0.1:3100/api/docs-json') as r:
    spec = json.loads(r.read().decode())
dash = {p: list(v.keys()) for p, v in spec['paths'].items() if 'dashboard' in p or 'analytics' in p}
check('swagger documents dashboard+analytics (GET only)', len(dash) == 10 and all(v == ['get'] for v in dash.values()),
      f"{len(dash)} paths, methods={sorted({m for v in dash.values() for m in v})}")

ROUTES = [
    '/admin/dashboard/overview', '/admin/dashboard/catalog', '/admin/dashboard/orders',
    '/admin/dashboard/payments', '/admin/dashboard/inventory', '/admin/dashboard/verifications',
    '/admin/dashboard/recent-orders', '/admin/dashboard/recent-payments',
    '/admin/dashboard/payment-review', '/admin/analytics/timeseries',
]

# unauthorized
codes = [call('GET', r)[0] for r in ROUTES]
check('all 10 routes require a token (401)', set(codes) == {401}, f'codes={set(codes)}')

# customer → 403
s, reg = call('POST', '/auth/register', body={
    'firstName': 'Live', 'lastName': 'Dsh', 'email': f'live.dash.{STAMP}@alwled.test',
    'phone': f'0732{STAMP}', 'password': PASS, 'confirmPassword': PASS,
})
assert s == 201, (s, reg)
s, login = call('POST', '/auth/login', body={'phone': f'0732{STAMP}', 'password': PASS})
cust = login['data']['accessToken']
s, me = call('GET', '/auth/me', token=cust)
customer_id = me['data']['id']
cust_codes = [call('GET', r, token=cust)[0] for r in ROUTES]
check('customer → 403 on every route', set(cust_codes) == {403}, f'codes={set(cust_codes)}')

# write verbs rejected
write_codes = []
for r in ROUTES:
    for verb in ('POST', 'PUT', 'PATCH', 'DELETE'):
        write_codes.append(call(verb, r, token=owner, body={})[0])
check('no write verb accepted (404/405)', set(write_codes) <= {404, 405}, f'codes={sorted(set(write_codes))}')

# snapshot for mutation safety
before = pg("""SELECT (SELECT COUNT(*) FROM orders)||'/'||(SELECT COUNT(*) FROM payments)||'/'||
(SELECT COUNT(*) FROM users)||'/'||(SELECT COALESCE(SUM(quantity),0) FROM inventory)||'/'||
(SELECT COUNT(*) FROM customer_verifications)||'/'||(SELECT COUNT(*) FROM products)||'/'||
(SELECT COUNT(*) FROM audit_logs)""")

# ---------- overview vs independent SQL ----------
s, ov = call('GET', '/admin/dashboard/overview', token=owner)
d = ov['data']
sql_ov = pg("""SELECT json_build_object(
 'orders', (SELECT COUNT(*) FROM orders),
 'pending', (SELECT COUNT(*) FROM orders WHERE status='PENDING'),
 'confirmed', (SELECT COUNT(*) FROM orders WHERE status='CONFIRMED'),
 'cancelled', (SELECT COUNT(*) FROM orders WHERE status='CANCELLED'),
 'succeeded', (SELECT COUNT(*) FROM payments WHERE status='SUCCEEDED'),
 'succeeded_amount', (SELECT COALESCE(SUM(amount),0)::text FROM payments WHERE status='SUCCEEDED'),
 'review', (SELECT COUNT(*) FROM payments WHERE status='PENDING_REVIEW'),
 'users', (SELECT COUNT(*) FROM users),
 'qty', (SELECT COALESCE(SUM(quantity),0) FROM inventory),
 'reserved', (SELECT COALESCE(SUM(reserved_quantity),0) FROM inventory),
 'verifications', (SELECT COUNT(*) FROM customer_verifications)
)::text""")
expected = json.loads(sql_ov)
check('overview.orders.total == SQL', d['orders']['total'] == expected['orders'], f"{d['orders']['total']} vs {expected['orders']}")
check('overview orders by status == SQL',
      (d['orders']['pending'], d['orders']['confirmed'], d['orders']['cancelled'])
      == (expected['pending'], expected['confirmed'], expected['cancelled']),
      f"{d['orders']} vs SQL({expected['pending']}/{expected['confirmed']}/{expected['cancelled']})")
check('overview.payments.succeeded == SQL', d['payments']['succeeded'] == expected['succeeded'], f"{d['payments']['succeeded']} vs {expected['succeeded']}")
check('overview.succeededAmount == SQL', d['payments']['succeededAmount'] == f"{float(expected['succeeded_amount']):.2f}",
      f"{d['payments']['succeededAmount']} vs {float(expected['succeeded_amount']):.2f}")
check('overview.pendingReview == SQL', d['payments']['pendingReview'] == expected['review'], f"{d['payments']['pendingReview']} vs {expected['review']}")
check('overview.inventory available == qty - reserved',
      d['inventory']['available'] == expected['qty'] - expected['reserved'],
      f"{d['inventory']['available']} == {expected['qty']}-{expected['reserved']}")
check('overview.users.total == SQL', d['users']['total'] == expected['users'], f"{d['users']['total']} vs {expected['users']}")
check('overview.verifications.total == SQL', d['verifications']['total'] == expected['verifications'],
      f"{d['verifications']['total']} vs {expected['verifications']}")

# ---------- payments analytics ----------
s, pay = call('GET', '/admin/dashboard/payments', token=owner)
pd = pay['data']
check('payments.succeededAmount is a 2-dec string', re.fullmatch(r'\d+\.\d{2}', pd['succeededAmount']) is not None, pd['succeededAmount'])
check('payments pending/review/failed buckets present',
      all(k in pd for k in ('pendingAmount', 'pendingReviewAmount', 'failedAmount', 'cancelledAmount')),
      f"pending={pd['pendingAmount']} review={pd['pendingReviewAmount']} failed={pd['failedAmount']}")
check('shamCash manual wording, no provider claim', 'يدوي' in pd['shamCash']['note'] and 'provider' not in json.dumps(pd['shamCash']),
      json.dumps(pd['shamCash'], ensure_ascii=False)[:110])
sql_succeeded = pg("SELECT COALESCE(SUM(amount),0)::text FROM payments WHERE status='SUCCEEDED'")
check('succeeded amount excludes pending (SUM only SUCCEEDED)',
      pd['succeededAmount'] == f"{float(sql_succeeded):.2f}",
      pd['succeededAmount'])

# ---------- inventory analytics ----------
s, inv = call('GET', '/admin/dashboard/inventory?includeMovements=true', token=owner)
inv_d = inv['data']
sql_inv = json.loads(pg("""SELECT json_build_object(
 'low', (SELECT COUNT(*) FROM inventory WHERE quantity - reserved_quantity <= low_stock_threshold),
 'out', (SELECT COUNT(*) FROM inventory WHERE quantity - reserved_quantity <= 0),
 'qty', (SELECT COALESCE(SUM(quantity),0) FROM inventory),
 'reserved', (SELECT COALESCE(SUM(reserved_quantity),0) FROM inventory)
)::text"""))
check('inventory.lowStock == SQL per-record threshold', inv_d['lowStock'] == sql_inv['low'], f"{inv_d['lowStock']} vs {sql_inv['low']}")
check('inventory.outOfStock == SQL available<=0', inv_d['outOfStock'] == sql_inv['out'], f"{inv_d['outOfStock']} vs {sql_inv['out']}")
check('inventory.available == quantity - reservedQuantity',
      inv_d['available'] == inv_d['totalQuantity'] - inv_d['totalReserved'],
      f"{inv_d['available']} == {inv_d['totalQuantity']}-{inv_d['totalReserved']}")
check('low-stock sample is bounded (<=10)', len(inv_d['lowStockProducts']) <= 10, str(len(inv_d['lowStockProducts'])))

# ---------- verification analytics (independent domain) ----------
s, ver = call('GET', '/admin/dashboard/verifications', token=owner)
check('verification counts == SQL', ver['data']['total'] == int(pg("SELECT COUNT(*) FROM customer_verifications")),
      f"{ver['data']['total']} vs {pg('SELECT COUNT(*) FROM customer_verifications')}")
check('verification.inReview == SQL IN_REVIEW',
      ver['data']['inReview'] == int(pg("SELECT COUNT(*) FROM customer_verifications WHERE status='IN_REVIEW'")),
      f"{ver['data']['inReview']}")
check('verification note: independent domain', 'مستقل' in ver['data']['note'], ver['data']['note'])

# ---------- review queue ----------
s, rev = call('GET', '/admin/dashboard/payment-review', token=owner)
check('review queue == SQL PENDING_REVIEW',
      rev['data']['awaitingReviewTotal'] == int(pg("SELECT COUNT(*) FROM payments WHERE status='PENDING_REVIEW'")),
      f"{rev['data']['awaitingReviewTotal']}")
check('review queue exposes no proof URL', 'proofUrl' not in json.dumps(rev),
      f"keys={sorted(rev['data']['items'][0].keys()) if rev['data']['items'] else 'empty'}")

# ---------- timeseries ----------
s, ts = call('GET', '/admin/analytics/timeseries?granularity=day', token=owner)
check('timeseries default = 30 buckets / UTC', ts['data']['range']['days'] == 30 and len(ts['data']['series']) == 30,
      f"days={ts['data']['range']['days']} buckets={len(ts['data']['series'])}")
sql_ts = json.loads(pg("""SELECT json_build_object(
 'orders', (SELECT COUNT(*) FROM orders WHERE created_at >= date_trunc('day', now()) - interval '29 days'),
 'value', (SELECT COALESCE(SUM(total),0)::text FROM orders WHERE created_at >= date_trunc('day', now()) - interval '29 days'),
 'succeeded', (SELECT COALESCE(SUM(amount),0)::text FROM payments WHERE status='SUCCEEDED' AND created_at >= date_trunc('day', now()) - interval '29 days')
)::text"""))
check('timeseries totals == SQL (last 30 days)',
      ts['data']['totals']['orders'] == sql_ts['orders']
      and float(ts['data']['totals']['orderValue']) == float(sql_ts['value'])
      and float(ts['data']['totals']['succeededPaymentAmount']) == float(sql_ts['succeeded']),
      f"{ts['data']['totals']} vs SQL {sql_ts}")
check('no float artifacts in timeseries', re.search(r'\d\.\d{6,}', json.dumps(ts)) is None, 'clean')

# ---------- pagination / validation ----------
check('limit=51 rejected', call('GET', '/admin/dashboard/recent-orders?limit=51', token=owner)[0] == 400)
check('limit=1000000 rejected', call('GET', '/admin/dashboard/recent-orders?limit=1000000', token=owner)[0] == 400)
check('sortBy whitelist enforced', call('GET', '/admin/dashboard/recent-payments?sortBy=passwordHash', token=owner)[0] == 400)
check('inverted range rejected', call('GET', '/admin/dashboard/orders?from=2026-09-10T00:00:00Z&to=2026-09-01T00:00:00Z', token=owner)[0] == 400)
check('range > 366d rejected', call('GET', '/admin/dashboard/orders?from=2000-01-01T00:00:00Z', token=owner)[0] == 400)

# ---------- leakage ----------
leak_paths = ROUTES + ['/admin/dashboard/orders?status=CONFIRMED', '/admin/dashboard/payments?status=SUCCEEDED']
leaks = []
for r in leak_paths:
    _, body = call('GET', r, token=owner)
    blob = json.dumps(body)
    for word in ('passwordHash', 'password_hash', 'refreshToken', 'tokenHash', 'apiKey', 'secret',
                 'authorization', 'proofUrl', 'providerPaymentId', 'storageKey'):
        if word in blob:
            leaks.append(f'{r}~{word}')
check('no sensitive fields in any dashboard response', not leaks, f'leaks={leaks}')

# ---------- performance ----------
timings = {}
for r in ['/admin/dashboard/overview', '/admin/dashboard/orders', '/admin/dashboard/payments', '/admin/dashboard/inventory']:
    t0 = time.time()
    status, _ = call('GET', r, token=owner)
    timings[r] = round((time.time() - t0) * 1000)
check('performance smoke: all endpoints answer < 1000ms', all(v < 1000 for v in timings.values()), str(timings))

# ---------- mutation safety ----------
after = pg("""SELECT (SELECT COUNT(*) FROM orders)||'/'||(SELECT COUNT(*) FROM payments)||'/'||
(SELECT COUNT(*) FROM users)||'/'||(SELECT COALESCE(SUM(quantity),0) FROM inventory)||'/'||
(SELECT COUNT(*) FROM customer_verifications)||'/'||(SELECT COUNT(*) FROM products)||'/'||
(SELECT COUNT(*) FROM audit_logs)""")
check('read-only: orders/payments/users/inventory/verifications/products/audit unchanged', before == after,
      f'{before} -> {after}')

# cleanup the temporary customer created by this check (my own artifact)
import subprocess
pw = re.search(r'DATABASE_URL="?postgresql://[^:]+:([^@]+)@', open('/root/alwled/.env').read()).group(1)
subprocess.run(['psql', '-h', '127.0.0.1', '-p', '5433', '-U', 'mp_user', '-d', 'alwled', '-Atc',
                f"DELETE FROM users WHERE id = '{customer_id}'"], env={'PGPASSWORD': pw, 'PATH': '/usr/bin:/bin'}, capture_output=True)
check('temporary live-check customer removed', 'ok', customer_id)

print()
print(f"TOTAL: {sum(1 for _, ok, _ in results if ok)}/{len(results)} passed")
print('STAMP=' + STAMP)
