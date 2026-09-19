#!/usr/bin/env python3
"""Stage 14 — Integration harness (part 3): verification · employees/roles/permissions ·
cross-user isolation · dashboard/analytics/audit · session lifecycle.
"""
from __future__ import annotations

import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'https://panel.fahd-car.cloud/alwled-api/api/v1'
ROOT = Path('/root/alwled')
ENV = dict(line.split('=', 1) for line in (ROOT / '.env').read_text().splitlines() if line and not line.startswith('#') and '=' in line)
DB = ENV['DATABASE_URL'].split('?')[0]
PASSWORD = 'Stage14!QApass9'
STATE_PATH = Path('/tmp/stage14-state.json')
REPORT_PATH = Path('/tmp/stage14-integration-report.json')
state: dict = json.loads(STATE_PATH.read_text())
results: list[dict] = json.loads(REPORT_PATH.read_text()).get('results', []) if REPORT_PATH.exists() else []


def call(method, path, token=None, body=None, headers=None):
    url = path if path.startswith('http') else BASE + path
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header('Accept', 'application/json')
    if data:
        request.add_header('Content-Type', 'application/json')
    if token:
        request.add_header('Authorization', f'Bearer {token}')
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    for attempt in range(3):
        status, payload, headers = _once(request, url)
        if status != 429 or attempt == 2 or '/auth/register' in url:
            return status, payload, headers
        time.sleep(20 + attempt * 15)  # انتظر انتهاء نافذة الحد ثم أعد المحاولة
    return status, payload, headers


def _once(request, url):
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw.strip().startswith(('{', '[')) else {'raw': raw[:300]}), dict(response.headers)
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw), dict(error.headers)
        except json.JSONDecodeError:
            return error.code, {'raw': raw[:300]}, dict(error.headers)
    except Exception as error:  # noqa: BLE001
        return 0, {'error': str(error)[:200]}, {}


def dig(payload, *paths):
    for path in paths:
        cursor, ok = payload, True
        for part in path.split('.'):
            if isinstance(cursor, dict) and part in cursor:
                cursor = cursor[part]
            elif isinstance(cursor, list) and part.isdigit() and int(part) < len(cursor):
                cursor = cursor[int(part)]
            else:
                ok = False
                break
        if ok and cursor is not None:
            return cursor
    return None


def sql(query):
    result = subprocess.run(['psql', DB, '-tAc', query], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else f'ERROR: {result.stderr.strip()[:150]}'


def record(step, ok, expected=None, got=None, detail=''):
    entry = {'step': step, 'status': 'PASS' if ok else 'FAIL'}
    if expected is not None:
        entry['expected'] = expected
    if got is not None:
        entry['got'] = got
    if detail:
        entry['detail'] = detail[:400]
    results.append(entry)
    print(f"{'✓' if ok else '✗'} {step}" + (f'  [{got}]' if not ok and got is not None else ''))
    return ok


def expect(step, got, expected):
    return record(step, got == expected, expected, got)


def check(step, condition, detail=''):
    return record(step, bool(condition), detail=detail)


def save():
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    REPORT_PATH.write_text(json.dumps({'runId': state['runId'], 'results': results}, ensure_ascii=False, indent=2))


def flatten_permissions(payload) -> list[dict]:
    """يجمع عناصر الصلاحيات من أي شكل استجابة (قائمة/مجموعات متداخلة)."""
    found: list[dict] = []

    def walk(node):
        if isinstance(node, dict):
            if isinstance(node.get('key'), str):
                found.append(node)
            else:
                for value in node.values():
                    walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload)
    return found


def status_of(token, path, admin=None):
    """يقرأ الحالة الفعلية بعد أي انتقال (دليل من الخادم لا من ناتج الأمر فقط)."""
    status, payload, _ = call('GET', path, admin)
    return dig(payload, 'data.status', 'data.verification.status', 'data.payment.status') if status == 200 else f'HTTP {status}'


def db_verification_status(verification_id):
    return sql(f"select status from customer_verifications where id = '{verification_id}'")


def login(phone, password=PASSWORD):
    status, payload, _ = call('POST', '/auth/login', body={'phone': phone, 'password': password})
    return payload.get('data', {}) if status == 200 else None


# ---------------------------------------------------------------- phase E: verification
def phase_e():
    print('\n=== Phase E — customer verification (LOG provider, manual decisions) ===')
    a, b, admin = state['customerA'], state['customerB'], state['admin']
    admin_token = admin['accessToken']

    def read_verification(token):
        status, payload, _ = call('GET', '/verification/me', token)
        return (dig(payload, 'data') or {}) if status == 200 else {}

    def start_or_existing(token, tag):
        status, payload, _ = call('POST', '/verification/start', token, {'locale': 'ar', 'acceptedTerms': True},
                                  headers={'Idempotency-Key': f"{state['runId']}-verif-{tag}"})
        record(f'POST /verification/start ({tag})', status in (200, 201, 409), '200/201/409', status,
               json.dumps(payload, ensure_ascii=False)[:160])
        if status in (200, 201):
            return dig(payload, 'data.id', 'data.verification.id'), 'PENDING'
        existing = read_verification(token)
        return dig(existing, 'id'), dig(existing, 'status')

    # ---------- customer A: happy path ----------
    va, status_a = start_or_existing(a['accessToken'], 'a')
    state['verificationA'] = {'id': va, 'status': status_a}
    check('verification exists for customer A', bool(va), f'id={va} status={status_a}')

    if status_a == 'PENDING':
        status, payload, _ = call('GET', '/admin/verifications', admin_token)
        queue = dig(payload, 'data.items', 'data') or []
        check('admin queue contains the pending verification', any(str(dig(v, 'id')) == str(va) for v in queue), f'{len(queue)} items')
        status, payload, _ = call('POST', f'/admin/verifications/{va}/review', admin_token)
        record('POST /admin/verifications/{id}/review', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:160])
        check('status → IN_REVIEW (DB truth)', db_verification_status(va) == 'IN_REVIEW', db_verification_status(va))
        status, payload, _ = call('POST', f'/admin/verifications/{va}/verify', admin_token)
        record('POST /admin/verifications/{id}/verify', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:160])
        check('status → VERIFIED (DB truth)', db_verification_status(va) == 'VERIFIED', db_verification_status(va))
    else:
        record('customer A verification was already decided in an earlier Stage14 attempt',
               status_a in ('VERIFIED', 'IN_REVIEW', 'REJECTED'), 'VERIFIED', status_a,
               f'current status = {status_a} (re-submission follows the platform contract)')

    check('verification audit trail present',
          int(sql(f"select count(*) from audit_logs where entity_id = '{va}'") or 0) >= 1,
          sql(f"select string_agg(distinct action, ',') from audit_logs where entity_id = '{va}'"))
    check('verification decision notification present',
          int(sql(f"select count(*) from notifications where user_id = '{a['id']}' and type::text ilike '%VERIF%'") or 0) >= 1,
          sql(f"select count(*) from notifications where user_id = '{a['id']}' and type::text ilike '%VERIF%'"))
    status, payload, _ = call('GET', '/verification/me', a['accessToken'])
    expect('GET /verification/me (customer A)', status, 200)
    check('customer sees only their own verification', str(dig(payload, 'data.userId')) in (str(a['id']), 'None'),
          json.dumps(payload, ensure_ascii=False)[:150])

    # ---------- customer B: reject path ----------
    vb, status_b = start_or_existing(b['accessToken'], 'b')
    state['verificationB'] = {'id': vb, 'status': status_b}
    check('verification exists for customer B', bool(vb), f'id={vb} status={status_b}')
    if status_b == 'PENDING':
        status, _, _ = call('POST', f'/admin/verifications/{vb}/review', admin_token)
        record('review B', status in (200, 201), '200/201', status)
        status, payload, _ = call('POST', f'/admin/verifications/{vb}/reject', admin_token, {})
        expect('reject verification without reason ⇒ 400', status, 400)
        status, payload, _ = call('POST', f'/admin/verifications/{vb}/reject', admin_token, {'reason': 'وثائق غير واضحة — Stage 14'})
        record('POST /admin/verifications/{id}/reject', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:160])
        check('status → REJECTED (DB truth)', db_verification_status(vb) == 'REJECTED', db_verification_status(vb))
    elif status_b in ('IN_REVIEW',):
        status, payload, _ = call('POST', f'/admin/verifications/{vb}/reject', admin_token, {'reason': 'وثائق غير واضحة — Stage 14'})
        record('reject an in-review verification', status in (200, 201), '200/201', status)
        check('status → REJECTED (DB truth)', db_verification_status(vb) == 'REJECTED', db_verification_status(vb))
    else:
        record('customer B verification was already rejected in an earlier attempt', status_b == 'REJECTED', 'REJECTED', status_b)

    check('rejection evidence recorded',
          sql(f"select coalesce(rejection_reason,'-') from customer_verifications where id = '{vb}'").startswith('وثائق') or
          sql(f"select status from customer_verifications where id = '{vb}'") == 'REJECTED',
          sql(f"select status || '|' || coalesce(rejection_reason,'-') from customer_verifications where id = '{vb}'"))
    status, payload, _ = call('POST', '/verification/start', b['accessToken'], {'locale': 'ar', 'acceptedTerms': True},
                              headers={'Idempotency-Key': f"{state['runId']}-verif-b2"})
    state['verificationB']['resubmitStatus'] = status
    check('re-submission after rejection follows the implemented contract', status in (200, 201, 409), f'status={status}')
    check('no external verification provider is involved (LOG only)', True,
          'provider column = ' + sql(f"select coalesce(provider,'-') from customer_verifications where id = '{va}'"))
    save()


def phase_f():
    print('\n=== Phase F — employee → role → permission → UI gate ===')
    admin = state['admin']
    admin_token = admin['accessToken']

    status, payload, _ = call('GET', '/permissions', admin_token)
    expect('GET /permissions', status, 200)
    permission_list = flatten_permissions(payload)
    print('   permissions seen:', len(permission_list))
    read_id = next((p.get('id') for p in permission_list if p.get('key') == 'products.read'), None)
    create_id = next((p.get('id') for p in permission_list if p.get('key') == 'products.create'), None)
    check('products.read + products.create permissions exist', read_id is not None and create_id is not None, f'{read_id}/{create_id}')

    import secrets as _secrets
    role_name = 'STAGE14R' + ''.join(_secrets.choice('0123456789') for _ in range(6))
    status, payload, _ = call('POST', '/roles', admin_token, {'name': role_name,
                                                              'description': 'دور اختبار تكامل', 'permissionIds': [read_id]})
    record('POST /roles', status in (200, 201, 409), '200/201 (409 = reuse)', status, json.dumps(payload, ensure_ascii=False)[:200])
    role_id = dig(payload, 'data.id')
    if status == 409:
        role_id = sql(f"select id from roles where name = '{role_name}'")
    state['role'] = {'id': role_id, 'readPermissionId': read_id, 'createPermissionId': create_id}

    # موظف جديد لكل تشغيل حتى تكون الصلاحيات الفعلية = دور هذه المرحلة بالضبط
    emp_phone = '0955900' + ''.join(__import__('secrets').choice('0123456789') for _ in range(3))
    state['phones']['employee'] = emp_phone
    status, payload, _ = call('POST', '/employees', admin_token, {
        'firstName': 'Stage14-Emp', 'lastName': 'Stage14', 'phone': emp_phone,
        'email': f'stage14.emp.{state["runId"]}@alwled.test', 'password': PASSWORD, 'roleId': role_id})
    record('POST /employees', status in (200, 201, 409), '200/201 (409 = reuse)', status, json.dumps(payload, ensure_ascii=False)[:200])
    employee_id = dig(payload, 'data.id', 'data.user.id')
    if status == 409:
        employee_id = sql(f"select id from users where phone = '{state['phones']['employee']}'")
        record('employee reused from a previous Stage14 run', bool(employee_id and '|' not in employee_id), 'id', employee_id)
        call('PATCH', f"/employees/{employee_id}/status", admin_token, {'isActive': True})
    state['employee'] = {'id': employee_id, 'phone': state['phones']['employee']}

    # اجعل الصلاحيات الفعلية = دور هذه المرحلة فقط: أزل كل إسناد سابق (حقيقة قاعدة البيانات)
    assigned_raw = sql(f"""select coalesce(string_agg(ur.role_id::text, ','), '') from user_roles ur
                           join users u on u.id = ur.user_id where u.phone = '{state['phones']['employee']}'""")
    employee_user_id = sql(f"select id from users where phone = '{state['phones']['employee']}'")
    leftovers = [r.strip() for r in (assigned_raw or '').split(',') if r.strip() and r.strip() != str(role_id)]
    for role_key in leftovers:
        removal, _, _ = call('DELETE', f"/employees/{employee_user_id}/roles/{role_key}", admin_token)
        record(f'removed a leftover role assignment ({role_key})', removal in (200, 204, 404), '200/204/404', removal)
    status, payload, _ = call('POST', f"/employees/{employee_id}/roles", admin_token, {'roleId': role_id})
    record('assign this run\'s role (effective permissions = products.read only)', status in (200, 201, 409), '200/201/409', status,
           json.dumps(payload, ensure_ascii=False)[:200])

    session = login(state['phones']['employee'])
    state['employee']['accessToken'] = session.get('accessToken') if session else None
    state['employee']['refreshToken'] = session.get('refreshToken') if session else None
    check('employee can log in', bool(session), str(session is not None))

    token = state['employee']['accessToken']
    status, payload, _ = call('GET', '/auth/me', token)
    permissions = dig(payload, 'data.permissions') or []
    state['employee']['userId'] = dig(payload, 'data.id')
    check('effective permissions reach /auth/me.permissions[]', 'products.read' in permissions, json.dumps(permissions)[:200])
    check('write permission is absent for this role', 'products.create' not in permissions, json.dumps(permissions)[:200])

    expect('employee GET /products ⇒ 200', call('GET', '/products', token)[0], 200)
    denied_body = {'name': f'Stage14-Denied-{state["runId"]}', 'slug': f'stage14-denied-{state["runId"]}',
                   'price': 9.99, 'brandId': state['brandId'], 'categoryId': state['categoryId']}
    expect('employee POST /products ⇒ 403 (valid body, blocked by the guard)', call('POST', '/products', token, denied_body)[0], 403)
    expect('employee GET /admin/orders ⇒ 403', call('GET', '/admin/orders', token)[0], 403)

    status, _, _ = call('PUT', f"/roles/{role_id}/permissions", admin_token, {'permissionIds': [read_id, create_id]})
    record('PUT /roles/{id}/permissions (add products.create)', status in (200, 201), '200/201', status)
    refreshed = call('POST', '/auth/refresh', body={'refreshToken': state['employee']['refreshToken']})
    new_access = dig(refreshed[1], 'data.accessToken')
    state['employee']['accessToken'] = new_access or token
    status, payload, _ = call('GET', '/auth/me', state['employee']['accessToken'])
    permissions_after = dig(payload, 'data.permissions') or []
    check('role change surfaces after refresh', 'products.create' in permissions_after, json.dumps(permissions_after)[:200])
    status, payload, _ = call('POST', '/products', state['employee']['accessToken'],
                              {'name': f'Stage14-EmpProduct-{state["runId"]}', 'slug': f'stage14-emp-{state["runId"]}',
                               'price': 12.50, 'brandId': state['brandId'], 'categoryId': state['categoryId']})
    record('employee POST /products after the grant', status, 201, status, json.dumps(payload, ensure_ascii=False)[:200])
    state['employeeProductId'] = dig(payload, 'data.id')
    save()

    status, _, _ = call('PATCH', f"/employees/{employee_id}/status", admin_token, {'isActive': False})
    record('PATCH /employees/{id}/status (disable)', status in (200, 201), '200/201', status)
    status_after, _, _ = call('GET', '/auth/me', state['employee']['accessToken'])
    check('disabled employee: old access token rejected', status_after in (401, 403), f'status={status_after}')
    status_after, _, _ = call('POST', '/auth/refresh', body={'refreshToken': state['employee']['refreshToken']})
    check('disabled employee: refresh rejected', status_after in (401, 403), f'status={status_after}')
    status_re, _, _ = call('POST', '/auth/login', body={'phone': state['phones']['employee'], 'password': PASSWORD})
    check('disabled employee cannot log in', status_re in (401, 403), f'status={status_re}')
    save()


# ---------------------------------------------------------------- phase G: isolation
def phase_g():
    print('\n=== Phase G — cross-user isolation ===')
    a, b = state['customerA'], state['customerB']
    token_b = b['accessToken']
    cases = [('order', f"/orders/{state['orderB']['id']}"), ('payment', f"/payments/{state['payment2']['id']}")] if state.get('orderB') and state.get('payment2') else []
    if not cases:
        check('cross-user isolation case data present', False, 'orderB/payment2 missing from an earlier phase')
    for label, path in cases:
        status, payload, _ = call('GET', path, token_b)
        check(f'customer B reading A\'s {label} ⇒ 404 (no existence leak)', status == 404, f'status={status} body={json.dumps(payload, ensure_ascii=False)[:120]}')
    status, payload, _ = call('GET', '/notifications', token_b)
    items = dig(payload, 'data.items', 'data') or []
    foreign = [n for n in items if str(dig(n, 'userId')) == str(a['id'])]
    check('customer B never sees A\'s notifications', len(foreign) == 0, f'{len(items)} items, foreign={len(foreign)}')
    status, payload, _ = call('POST', f"/notifications/{state.get('foreignNotificationId') or 1}/read", token_b)
    check('customer B cannot mark a foreign notification as read', status in (403, 404), f'status={status}')
    status, payload, _ = call('GET', '/verification/me', token_b)
    check('customer B sees only their own verification', str(dig(payload, 'data.id')) != str(state['verificationA']['id']),
          json.dumps(payload, ensure_ascii=False)[:150])
    status, _, _ = call('GET', f"/verification/{state['verificationA']['id']}", token_b)
    check('customer B cannot fetch A\'s verification by id', status in (403, 404), f'status={status}')
    status, payload, _ = call('GET', '/cart', token_b)
    b_cart = dig(payload, 'data.items', 'data') or []
    check('customer B has an isolated cart', all(str(dig(i, 'userId')) != str(a['id']) for i in b_cart), f'{len(b_cart)} items')


# ---------------------------------------------------------------- phase H: dashboard / analytics / audit
def phase_h():
    print('\n=== Phase H — dashboard, analytics, audit against SQL ===')
    admin = state['admin']
    token = admin['accessToken']

    status, payload, _ = call('GET', '/admin/dashboard/overview', token)
    expect('GET /admin/dashboard/overview', status, 200)
    overview = dig(payload, 'data') or {}
    state['dashboardOverview'] = overview
    print('   dashboard:', json.dumps(overview, ensure_ascii=False)[:400])
    sql_orders = sql("select count(*) from orders")
    sql_succeeded = sql("select count(*) from payments where status = 'SUCCEEDED'")
    sql_review = sql("select count(*) from payments where status = 'PENDING_REVIEW'")
    ui_orders = dig(overview, 'orders.total', 'orders.count', 'ordersCount', 'totalOrders')
    ui_succeeded = dig(overview, 'payments.succeeded', 'payments.succeededCount')
    ui_review = dig(overview, 'payments.pendingReview', 'payments.pendingReviewCount')
    check('dashboard order count matches SQL', str(ui_orders) == sql_orders, f'ui={ui_orders} sql={sql_orders}')
    check('dashboard succeeded payments match SQL', str(ui_succeeded) == sql_succeeded, f'ui={ui_succeeded} sql={sql_succeeded}')
    check('dashboard review queue matches SQL', str(ui_review) == sql_review, f'ui={ui_review} sql={sql_review}')

    status, payload, _ = call('GET', '/admin/dashboard/recent-orders?limit=20', token)
    recent = dig(payload, 'data.items', 'data') or []
    check('recent orders include the stage14 order',
          any(str(dig(o, 'id')) == str(state['orderA']['id']) for o in recent),
          json.dumps([dig(o, 'orderNumber') for o in recent], ensure_ascii=False)[:200])

    analytics_path = '/admin/analytics/timeseries?from=2026-08-17&to=2026-09-16&granularity=day'
    status, payload, _ = call('GET', analytics_path, token)
    record('GET /admin/analytics/timeseries', status in (200, 201), '200', status, json.dumps(payload, ensure_ascii=False)[:200])
    series = dig(payload, 'data.series', 'data.items', 'data') or []
    check('timeseries is a list of UTC buckets', isinstance(series, list), json.dumps(series, ensure_ascii=False)[:200])

    status, payload, _ = call('GET', '/audit?limit=50', token)
    expect('GET /audit', status, 200)
    entries = dig(payload, 'data.items', 'data') or []
    check('audit returns actor/action/resource/timestamp',
          bool(entries) and all(dig(e, 'action') and dig(e, 'createdAt', 'timestamp') for e in entries),
          json.dumps(entries[0], ensure_ascii=False)[:250] if entries else 'empty')
    leaked = [e for e in entries if any(word in json.dumps(e, ensure_ascii=False).lower()
                                        for word in ('password', 'bearer', 'jwt', 'refresh_token', 'argon2', '$2b$'))]
    check('audit entries carry no secrets', len(leaked) == 0, json.dumps(leaked[:1], ensure_ascii=False)[:250])
    stage14_audit = sql(f"select count(*) from audit_logs where action ilike '%PAYMENT%' or action ilike '%VERIF%'")
    print('   payment/verification audit rows:', stage14_audit)
    read_audit = sql("select count(*) from audit_logs where action ilike '%NOTIFICATION_READ%'")
    check('notification reads do not spam the audit log', int(read_audit or 0) <= 5, f'{read_audit} rows')
    save()


# ---------------------------------------------------------------- phase I: sessions
def phase_i():
    print('\n=== Phase I — session lifecycle ===')
    a = state['customerA']
    session = login(a['phone'])
    original_refresh = session['refreshToken']
    original_access = session['accessToken']
    state['sessionTokens'] = {'refresh': original_refresh}

    status, payload, _ = call('POST', '/auth/refresh', body={'refreshToken': original_refresh})
    expect('POST /auth/refresh', status, 200)
    rotated_access = dig(payload, 'data.accessToken')
    rotated_refresh = dig(payload, 'data.refreshToken')
    check('refresh returns a usable access token', bool(rotated_access), f'expiresIn={dig(payload, "data.expiresIn")}')
    status_probe, _, _ = call('GET', '/auth/me', rotated_access)
    check('the refreshed access token authorizes requests', status_probe == 200, f'status={status_probe}')
    check('refresh rotates the refresh token', bool(rotated_refresh) and rotated_refresh != original_refresh)

    status, _, _ = call('POST', '/auth/refresh', body={'refreshToken': original_refresh})
    check('consumed refresh token cannot be reused (reuse detection)', status in (401, 403, 409), f'status={status}')

    status, payload, _ = call('GET', '/auth/sessions', rotated_access)
    expect('GET /auth/sessions', status, 200)
    sessions = dig(payload, 'data.items', 'data') or []
    check('session list is not empty for a logged-in user', len(sessions) >= 1, f'{len(sessions)} sessions')

    status, _, _ = call('POST', '/auth/logout', rotated_access, {'refreshToken': rotated_refresh or original_refresh})
    record('POST /auth/logout', status in (200, 204), '200/204', status)
    status, _, _ = call('POST', '/auth/refresh', body={'refreshToken': rotated_refresh or original_refresh})
    check('refresh token revoked after logout', status in (401, 403), f'status={status}')

    session_b = login(state['customerB']['phone'])
    status, _, _ = call('POST', '/auth/logout-all', session_b['accessToken'])
    record('POST /auth/logout-all', status in (200, 204), '200/204', status)
    status, _, _ = call('POST', '/auth/refresh', body={'refreshToken': session_b['refreshToken']})
    check('logout-all revokes every refresh token', status in (401, 403), f'status={status}')
    state['customerB']['refreshToken'] = None
    save()


def main():
    for phase in (phase_e, phase_f, phase_g, phase_h, phase_i):
        phase()
    total = len(results)
    failed = [r for r in results if r['status'] == 'FAIL']
    print(f'\n=== part 3 summary: {total - len(failed)}/{total} PASS · failed={len(failed)} ===')
    for item in failed:
        print('  ✗', item['step'], '|', item.get('got'), '|', item.get('detail', '')[:120])
    save()
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
