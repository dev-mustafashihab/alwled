"""Stage 9 live verification against the running server (spec §25). Read/write only via the public API."""
import json
import time
import urllib.error
import urllib.request

B = 'http://127.0.0.1:3100/api/v1'
STAMP = str(int(time.time()))[-7:]
PASS = 'Str0ng!Pass1'


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
            return e.code, {'raw': raw}


def owner_token():
    import re
    env = open('/root/alwled/.env').read()
    phone = re.search(r'SEED_OWNER_PHONE=(.*)', env).group(1).strip()
    pw = re.search(r'SEED_OWNER_PASSWORD=(.*)', env).group(1).strip()
    s, b = call('POST', '/auth/login', body={'phone': phone, 'password': pw})
    assert s == 200, (s, b)
    return b['data']['accessToken']


def register(who, phone):
    body = {
        'firstName': 'Live', 'lastName': f'V{who}', 'email': f'live.{who}.{STAMP}@alwled.test',
        'phone': phone, 'password': PASS, 'confirmPassword': PASS,
    }
    s, b = call('POST', '/auth/register', body=body)
    assert s == 201, (who, s, b)
    s, b = call('POST', '/auth/login', body={'phone': phone, 'password': PASS})
    assert s == 200, (who, s, b)
    token = b['data']['accessToken']
    s, me = call('GET', '/auth/me', token=token)
    return token, me['data']['id']


results = []


def check(label, ok, detail=''):
    results.append((label, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'} | {label} | {detail}")


# health + swagger
s, _ = call('GET', '/health')
check('health 200', s == 200, str(s))
s, _ = call('GET', '/health', headers={})
with urllib.request.urlopen('http://127.0.0.1:3100/api/docs') as r:
    docs_status = r.status
with urllib.request.urlopen('http://127.0.0.1:3100/api/docs-json') as r:
    spec = json.loads(r.read().decode())
check('swagger 200', docs_status == 200, str(docs_status))
ver_paths = [p for p in spec['paths'] if 'verification' in p]
check('swagger verification paths', len(ver_paths) >= 8, f'{len(ver_paths)} paths: {sorted(ver_paths)}')

owner = owner_token()

# customer A and B
tok_a, id_a = register('a', f'0331{STAMP}')
tok_b, id_b = register('b', f'0332{STAMP}')

s, me = call('GET', '/verification/me', token=tok_a)
check('A me = NOT_STARTED', s == 200 and me['data']['status'] == 'NOT_STARTED', json.dumps(me['data'])[:120])

s, started = call('POST', '/verification/start', token=tok_a, body={'locale': 'ar'}, headers={'Idempotency-Key': f'live-{STAMP}-1'})
ver = started.get('data', {}).get('verification', started.get('data', {}))
check('A start => PENDING/LOG', s == 201 and ver.get('status') == 'PENDING' and ver.get('provider') == 'LOG',
      f"status={s} body={json.dumps(started)[:160]}")
ver_id = ver.get('id')

s, me2 = call('GET', '/verification/me', token=tok_a)
check('A me returns same record', me2['data']['id'] == ver_id, f"{me2['data']['id']} == {ver_id}")

s, other = call('GET', f'/verification/{ver_id}', token=tok_b)
check('B cannot read A (404)', s == 404, f'status={s}')

s, fake = call('POST', '/verification/start', token=tok_a, body={'status': 'VERIFIED'}, headers={'Idempotency-Key': f'live-{STAMP}-2'})
check('fake status => 400', s == 400, f'status={s} {json.dumps(fake)[:120]}')

s, fake2 = call('POST', '/verification/start', token=tok_a, body={'userId': id_b}, headers={'Idempotency-Key': f'live-{STAMP}-3'})
check('client userId => 400', s == 400, f'status={s}')

for path in ('/verification/success', '/verification/verify', '/verification/mock-success'):
    s, _ = call('POST', path, token=tok_a, body={})
    check(f'no fake endpoint {path}', s == 404, f'status={s}')

# parallel starts for a fresh customer
tok_c, id_c = register('c', f'0333{STAMP}')
import concurrent.futures
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    f1 = pool.submit(call, 'POST', '/verification/start', tok_c, {}, {'Idempotency-Key': f'live-{STAMP}-c1'})
    f2 = pool.submit(call, 'POST', '/verification/start', tok_c, {}, {'Idempotency-Key': f'live-{STAMP}-c2'})
    r1, r2 = f1.result(), f2.result()
check('parallel start => one 201 / one 409', sorted([r1[0], r2[0]]) == [201, 409], f'{r1[0]}, {r2[0]}')

# admin: no-permission user and a permitted admin
tok_np, id_np = register('np', f'0334{STAMP}')  # customer token only
s, list_np = call('GET', '/admin/verifications', token=tok_np)
check('customer on admin route => 403', s == 403, f'status={s}')

s, created = call('POST', '/employees', token=owner, body={
    'firstName': 'Live', 'lastName': 'Admin', 'email': f'live.admin.{STAMP}@alwled.test',
    'phone': f'0335{STAMP}', 'password': PASS, 'roleName': 'ADMIN',
})
check('create ADMIN employee', s == 201, f'status={s} {json.dumps(created)[:120]}')
s, login = call('POST', '/auth/login', body={'phone': f'0335{STAMP}', 'password': PASS})
tok_admin = login['data']['accessToken']

s, lst = call('GET', '/admin/verifications?status=PENDING&limit=50', token=tok_admin)
check('admin lists PENDING (verification.read)', s == 200, f"status={s} total={lst.get('data', {}).get('meta', {}).get('total')}")

s, rev = call('POST', f'/admin/verifications/{ver_id}/review', token=tok_admin, body={})
check('admin review => IN_REVIEW', s == 200 and rev['data']['status'] == 'IN_REVIEW', f"status={s} {rev.get('data', {}).get('status')}")

s, ver_res = call('POST', f'/admin/verifications/{ver_id}/verify', token=tok_admin, body={})
check('admin verify => VERIFIED/MANUAL', s == 200 and ver_res['data']['status'] == 'VERIFIED' and ver_res['data']['source'] == 'MANUAL',
      f"status={s} {ver_res.get('data', {}).get('status')}/{ver_res.get('data', {}).get('source')}")

s, again = call('POST', f'/admin/verifications/{ver_id}/verify', token=tok_admin, body={})
check('double verify => 409', s == 409, f'status={s}')

# reject flow with mandatory reason on customer B
s, b_start = call('POST', '/verification/start', token=tok_b, body={}, headers={'Idempotency-Key': f'live-{STAMP}-b1'})
b_id = b_start['data']['verification']['id']
call('POST', f'/admin/verifications/{b_id}/review', token=tok_admin, body={})
s, no_reason = call('POST', f'/admin/verifications/{b_id}/reject', token=tok_admin, body={})
check('reject without reason => 400', s == 400, f'status={s}')
s, rejected = call('POST', f'/admin/verifications/{b_id}/reject', token=tok_admin, body={'reason': 'الاسم لا يطابق بيانات الحساب'})
check('reject => REJECTED', s == 200 and rejected['data']['status'] == 'REJECTED', f"status={s} {rejected.get('data', {}).get('status')}")
s, retry = call('POST', '/verification/start', token=tok_b, body={}, headers={'Idempotency-Key': f'live-{STAMP}-b2'})
check('retry after REJECTED => PENDING attempt 2', s == 201 and retry['data']['verification']['attempt'] == 2,
      f"status={s} attempt={retry.get('data', {}).get('verification', {}).get('attempt')}")

# no leakage in responses
blob = json.dumps([me, me2, started, lst, rev, ver_res, rejected, retry])
leaks = [w for w in ('passwordHash', 'tokenHash', 'authorization', 'apiKey', 'api_key', 'secret', 'refreshToken') if w in blob]
check('no sensitive fields in responses', not leaks, f'leaks={leaks}')

print()
print(f"TOTAL: {sum(1 for _, ok, _ in results if ok)}/{len(results)} passed")
print('STAMP=' + STAMP, '| ver_id=' + str(ver_id), '| admin_phone=0335' + STAMP, '| b_ver_id=' + str(b_id))
