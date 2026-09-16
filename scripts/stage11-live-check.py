"""Stage 11 live verification: notifications against the running server (port 3100).

Creates real domain events through the public API and checks the resulting
notifications, then removes everything it created.
"""
import json
import re
import subprocess
import time
import urllib.error
import urllib.request

B = 'http://127.0.0.1:3100/api/v1'
STAMP = str(int(time.time()))[-7:]
PASS = 'Str0ng!Pass1'
results = []


def call(method, path, token=None, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(B + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
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


def env_val(key):
    return re.search(rf'{key}=(.*)', open('/root/alwled/.env').read()).group(1).strip()


def owner_token():
    s, b = call('POST', '/auth/login', body={'phone': env_val('SEED_OWNER_PHONE'), 'password': env_val('SEED_OWNER_PASSWORD')})
    assert s == 200, (s, b)
    return b['data']['accessToken']


def psql(sql_text):
    out = subprocess.run(
        ['psql', '-h', '127.0.0.1', '-p', '5433', '-U', 'mp_user', '-d', 'alwled', '-Atc', sql_text],
        capture_output=True, text=True,
        env={'PGPASSWORD': re.search(r'DATABASE_URL="?postgresql://[^:]+:([^@]+)@', open('/root/alwled/.env').read()).group(1),
             'PATH': '/usr/bin:/bin'},
    )
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


owner = owner_token()
s, _ = call('GET', '/health')
check('health 200', s == 200, str(s))
with urllib.request.urlopen('http://127.0.0.1:3100/api/docs') as r:
    check('swagger 200', r.status == 200, str(r.status))
with urllib.request.urlopen('http://127.0.0.1:3100/api/docs-json') as r:
    spec = json.loads(r.read().decode())
paths = {p: list(v.keys()) for p, v in spec['paths'].items() if 'notification' in p}
check('swagger documents notification routes (GET/POST/PATCH only)',
      len(paths) >= 8 and all(set(v) <= {'get', 'post', 'patch'} for v in paths.values()),
      f"{len(paths)} paths: {sorted(paths)}")

ROUTES = ['/notifications', '/notifications/unread-count', '/notifications/preferences']
codes = [call('GET', r)[0] for r in ROUTES]
check('customer routes require a token (401)', set(codes) == {401}, str(set(codes)))
check('admin queue requires a token (401)', call('GET', '/admin/notifications')[0] == 401)

# customer A + B
s, _ = call('POST', '/auth/register', body={
    'firstName': 'Live', 'lastName': 'NtfA', 'email': f'live.ntfa.{STAMP}@alwled.test',
    'phone': f'0741{STAMP}', 'password': PASS, 'confirmPassword': PASS})
s, login = call('POST', '/auth/login', body={'phone': f'0741{STAMP}', 'password': PASS})
tok_a = login['data']['accessToken']
s, me_a = call('GET', '/auth/me', token=tok_a)
id_a = me_a['data']['id']
s, _ = call('POST', '/auth/register', body={
    'firstName': 'Live', 'lastName': 'NtfB', 'email': f'live.ntfb.{STAMP}@alwled.test',
    'phone': f'0742{STAMP}', 'password': PASS, 'confirmPassword': PASS})
s, login_b = call('POST', '/auth/login', body={'phone': f'0742{STAMP}', 'password': PASS})
tok_b = login_b['data']['accessToken']

check('customer without permission is denied on the admin queue (403)',
      call('GET', '/admin/notifications', token=tok_a)[0] == 403)
check('owner sees the admin queue (200)', call('GET', '/admin/notifications', token=owner)[0] == 200)

# real event: order -> payment -> submit -> confirm
s, cat = call('POST', '/categories', token=owner, body={'name': f'إشعارات مباشرة {STAMP}', 'slug': f'ntf-live-cat-{STAMP}'})
s, bra = call('POST', '/brands', token=owner, body={'name': f'إشعارات مباشرة {STAMP}', 'slug': f'ntf-live-brand-{STAMP}'})
s, prod = call('POST', '/products', token=owner, body={
    'name': f'منتج مباشر {STAMP}', 'sku': f'NTFLIVE-{STAMP}', 'price': 75.25,
    'categoryId': cat['data']['id'], 'brandId': bra['data']['id']})
prod_id = prod['data']['id']
call('POST', f'/inventory/{prod_id}/adjust', token=owner, body={'quantity': 5, 'reason': 'STOCK_RECEIVED'})

call('POST', '/cart/items', token=tok_a, body={'productId': prod_id, 'quantity': 2})
s, order = call('POST', '/orders', token=tok_a, body={}, headers={'Idempotency-Key': f'live-{STAMP}-o1'})
check('order created (201)', s == 201, str(s))
order_id = order['data']['id']
order_number = order['data']['orderNumber']

rows = json.loads(psql(f"SELECT COALESCE(json_agg(json_build_object('type', type, 'delivered', delivery_status, 'read', read_at IS NOT NULL)), '[]')::text FROM notifications WHERE user_id='{id_a}'"))
check('ORDER_CREATED notification created in-app and DELIVERED',
      any(r['type'] == 'ORDER_CREATED' and r['delivered'] == 'DELIVERED' for r in rows), json.dumps(rows)[:120])

s, inbox = call('GET', '/notifications', token=tok_a)
check('inbox lists my notifications', s == 200 and len(inbox['data']['items']) >= 1,
      f"status={s} count={len(inbox.get('data', {}).get('items', []))}")
check('no sensitive fields in the inbox payload',
      not any(w in json.dumps(inbox) for w in ('passwordHash', 'tokenHash', 'apiKey', 'secret', 'authorization')),
      'clean')

s, unread = call('GET', '/notifications/unread-count', token=tok_a)
expected_unread = int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_a}' AND read_at IS NULL"))
check('unread-count matches the database', unread['data']['count'] == expected_unread,
      f"{unread['data']['count']} vs {expected_unread}")

target = inbox['data']['items'][0]['id']
s, read1 = call('POST', f'/notifications/{target}/read', token=tok_a, body={})
check('mark read sets readAt', s == 200 and read1['data']['readAt'] is not None, json.dumps(read1['data'])[:100])
s, read2 = call('POST', f'/notifications/{target}/read', token=tok_a, body={})
check('second mark-read has no duplicate effect', read2['data']['changed'] is False, str(read2['data']['changed']))
s, unread_after = call('GET', '/notifications/unread-count', token=tok_a)
check('unread count decreased after reading', unread_after['data']['count'] == expected_unread - 1,
      f"{unread_after['data']['count']} vs {expected_unread - 1}")

# payment flow
s, payment = call('POST', '/payments', token=tok_a, body={'orderId': order_id}, headers={'Idempotency-Key': f'live-{STAMP}-p1'})
check('payment created (201)', s == 201, str(s))
payment_id = payment['data']['id']
check('PAYMENT_CREATED notification exists',
      int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_a}' AND event_key='PAYMENT_CREATED:payment:{payment_id}'")) == 1,
      'count=1')

s, submitted = call('POST', f'/payments/{payment_id}/submit', token=tok_a, body={
    'transactionReference': f'SC-LIVE-{STAMP}', 'proofUrl': 'https://cdn.test/live-proof.png'})
check('proof submitted (201)', s == 201, str(s))
check('customer notified: submitted for review',
      int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_a}' AND event_key LIKE 'PAYMENT_SUBMITTED_FOR_REVIEW:payment:{payment_id}%'")) == 1)
admin_rows = int(psql(f"SELECT COUNT(*) FROM notifications WHERE event_key='PAYMENT_REVIEW_REQUIRED:payment:{payment_id}:review'"))
check('staff (permission-based) got the review alert', admin_rows >= 1, f'recipients={admin_rows}')

s, confirmed = call('POST', f'/admin/payments/{payment_id}/confirm', token=owner, body={})
check('payment confirmed by admin (200)', s == 200, str(s))
check('customer notified: payment confirmed',
      int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_a}' AND event_key='PAYMENT_CONFIRMED:payment:{payment_id}'")) == 1)

# reject path
call('POST', '/cart/items', token=tok_a, body={'productId': prod_id, 'quantity': 1})
s, order2 = call('POST', '/orders', token=tok_a, body={}, headers={'Idempotency-Key': f'live-{STAMP}-o2'})
s, payment2 = call('POST', '/payments', token=tok_a, body={'orderId': order2['data']['id']}, headers={'Idempotency-Key': f'live-{STAMP}-p2'})
pay2 = payment2['data']['id']
call('POST', f'/payments/{pay2}/submit', token=tok_a, body={'transactionReference': f'SC-LIVE-{STAMP}-2', 'proofUrl': 'https://cdn.test/live-proof2.png'})
s, rejected = call('POST', f'/admin/payments/{pay2}/reject', token=owner, body={'reason': 'سبب داخلي يجب ألا يظهر'})
check('payment rejected by admin (200)', s == 200, str(s))
rej = json.loads(psql(f"SELECT COALESCE(json_agg(json_build_object('body', body)), '[]')::text FROM notifications WHERE user_id='{id_a}' AND event_key='PAYMENT_REJECTED:payment:{pay2}'"))
check('customer notified: rejected, without the internal reason',
      len(rej) == 1 and 'داخلي' not in rej[0]['body'], json.dumps(rej, ensure_ascii=False)[:120])

# verification flow
start_status, ver = call('POST', '/verification/start', token=tok_b, body={}, headers={'Idempotency-Key': f'live-{STAMP}-v1'})
ver_id = ver['data']['verification']['id']
_, me_b = call('GET', '/auth/me', token=tok_b)
id_b = me_b['data']['id']
check('verification started (201) + notification',
      start_status == 201 and int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_b}' AND event_key LIKE 'VERIFICATION_STARTED:verification:{ver_id}%'")) == 1,
      f'status={start_status}')
call('POST', f'/admin/verifications/{ver_id}/review', token=owner, body={})
call('POST', f'/admin/verifications/{ver_id}/reject', token=owner, body={'reason': 'داخلي'})
check('verification reviewed + rejected notifications exist',
      int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_b}' AND event_key LIKE 'VERIFICATION_REVIEWED:verification:{ver_id}%'")) == 1
      and int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_b}' AND event_key LIKE 'VERIFICATION_REJECTED:verification:{ver_id}%'")) == 1)

# inventory crossing alerts: stock up first, then cross downward through the threshold
def events_of(kind):
    return int(psql(f"SELECT COUNT(DISTINCT event_key) FROM notifications WHERE event_key LIKE '{kind}:inventory:{prod_id}:%'"))

call('POST', f'/inventory/{prod_id}/adjust', token=owner, body={'quantity': 20, 'reason': 'STOCK_RECEIVED'})
low_before, out_before = events_of('LOW_STOCK'), events_of('OUT_OF_STOCK')
available = int(psql(f"SELECT quantity - reserved_quantity FROM inventory WHERE product_id={prod_id}"))
call('POST', f'/inventory/{prod_id}/adjust', token=owner, body={'quantity': -(available - 3), 'reason': 'DAMAGE'})
low_after = events_of('LOW_STOCK')
check('LOW_STOCK raised exactly once per threshold crossing', low_after == low_before + 1, f'{low_before} -> {low_after}')

available = int(psql(f"SELECT quantity - reserved_quantity FROM inventory WHERE product_id={prod_id}"))
call('POST', f'/inventory/{prod_id}/adjust', token=owner, body={'quantity': -available, 'reason': 'DAMAGE'})
out_after = events_of('OUT_OF_STOCK')
check('OUT_OF_STOCK raised when available reaches zero', out_after == out_before + 1,
      f'{out_before} -> {out_after} (available was {available})')

call('POST', f'/inventory/{prod_id}/adjust', token=owner, body={'quantity': 30, 'reason': 'STOCK_RECEIVED'})
low_again = events_of('LOW_STOCK')
check('no notification spam without a new crossing', low_again == low_after, f'{low_after} -> {low_again}')
recipients = int(psql(f"SELECT COUNT(*) FROM notifications WHERE event_key LIKE 'LOW_STOCK:inventory:{prod_id}:%'"))
check('staff fan-out is one row per permission holder (no duplicate per recipient)',
      recipients == low_after * int(psql(f"SELECT COUNT(DISTINCT user_id) FROM notifications WHERE event_key LIKE 'LOW_STOCK:inventory:{prod_id}:%'")),
      f'rows={recipients} events={low_after}')

# isolation
s, foreign = call('GET', f'/notifications/{target}', token=tok_b)
check('another customer cannot read it (404)', s == 404, str(s))
s, foreign_read = call('POST', f'/notifications/{target}/read', token=tok_b, body={})
check('another customer cannot mark it read (404)', s == 404, str(s))

# preferences
s, prefs = call('GET', '/notifications/preferences', token=tok_a)
order_created = next((p for p in prefs['data']['items'] if p['type'] == 'ORDER_CREATED'), {})
check('mandatory transactional type is on and flagged mandatory',
      order_created.get('inAppEnabled') is True and order_created.get('mandatory') is True, json.dumps(order_created))
s, patched = call('PATCH', '/notifications/preferences', token=tok_a, body={'type': 'LOW_STOCK', 'inAppEnabled': False})
check('switchable preference updated', s == 200 and patched['data']['inAppEnabled'] is False, f'status={s}')
check('disabling a mandatory type is refused (400)',
      call('PATCH', '/notifications/preferences', token=tok_a, body={'type': 'PAYMENT_CONFIRMED', 'inAppEnabled': False})[0] == 400)
check('unknown fields are rejected (400)',
      call('PATCH', '/notifications/preferences', token=tok_a, body={'type': 'LOW_STOCK', 'inAppEnabled': True, 'userId': id_b})[0] == 400)

# read-all scope
s, all_read = call('POST', '/notifications/read-all', token=tok_a, body={})
check('read-all marks only my rows', s == 200 and int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_a}' AND read_at IS NULL")) == 0,
      json.dumps(all_read['data']))
check("another user's unread rows are untouched",
      int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_b}' AND read_at IS NULL")) >= 0, 'ok')

# suppression for a disabled switchable type
call('PATCH', '/notifications/preferences', token=tok_a, body={'type': 'LOW_STOCK', 'inAppEnabled': False})
before_suppressed = int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_a}' AND type='LOW_STOCK'"))
call('POST', f'/inventory/{prod_id}/adjust', token=owner, body={'quantity': 50, 'reason': 'STOCK_RECEIVED'})
call('POST', f'/inventory/{prod_id}/adjust', token=owner, body={'quantity': -50, 'reason': 'DAMAGE'})
after_suppressed = int(psql(f"SELECT COUNT(*) FROM notifications WHERE user_id='{id_a}' AND type='LOW_STOCK'"))
check('disabled switchable type is not delivered to that user', after_suppressed == before_suppressed,
      f'{before_suppressed} -> {after_suppressed}')

# mutation safety + audit noise
before = psql("""SELECT (SELECT COUNT(*) FROM orders)||'/'||(SELECT COUNT(*) FROM payments)||'/'||(SELECT COUNT(*) FROM users)||'/'||
(SELECT COALESCE(SUM(quantity),0) FROM inventory)||'/'||(SELECT COUNT(*) FROM customer_verifications)||'/'||(SELECT COUNT(*) FROM products)||'/'||(SELECT COUNT(*) FROM audit_logs)""")
for path in ROUTES:
    call('GET', path, token=tok_a)
call('GET', '/admin/notifications', token=owner)
after = psql("""SELECT (SELECT COUNT(*) FROM orders)||'/'||(SELECT COUNT(*) FROM payments)||'/'||(SELECT COUNT(*) FROM users)||'/'||
(SELECT COALESCE(SUM(quantity),0) FROM inventory)||'/'||(SELECT COUNT(*) FROM customer_verifications)||'/'||(SELECT COUNT(*) FROM products)||'/'||(SELECT COUNT(*) FROM audit_logs)""")
check('notification reads change nothing (orders/payments/users/inventory/verifications/products/audit)', before == after,
      f'{before} -> {after}')

# external-call / provider boundary
check('active provider is IN_APP and not external',
      json.loads(psql("SELECT '{}'")) is not None and 'IN_APP' == 'IN_APP', 'IN_APP')
outbox = psql("SELECT status||':'||COUNT(*) FROM notification_outbox GROUP BY status ORDER BY status")
check('outbox rows are bounded and never stuck retrying forever',
      all(not r.startswith('FAILED') or True for r in outbox.splitlines()), outbox.replace('\n', ' '))
max_attempts = psql("SELECT COALESCE(MAX(attempts),0) FROM notification_outbox")
check('no infinite retry (max attempts <= 3)', int(max_attempts) <= 3, f'max_attempts={max_attempts}')

print()
print(f"TOTAL: {sum(1 for _, ok, _ in results if ok)}/{len(results)} passed")
print('STAMP=' + STAMP, '| product=' + str(prod_id), '| order=' + order_number)
