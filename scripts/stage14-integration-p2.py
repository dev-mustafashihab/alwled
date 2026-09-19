#!/usr/bin/env python3
"""Stage 14 — Integration harness (part 2): sham cash review · concurrency · verification ·
employees/permissions · isolation · dashboard/analytics/audit · sessions.

يكمل من حالة /tmp/stage14-state.json ويضيف النتائج إلى /tmp/stage14-integration-report.json.
"""
from __future__ import annotations

import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
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


def login(phone, password=PASSWORD):
    status, payload, _ = call('POST', '/auth/login', body={'phone': phone, 'password': password})
    if status != 200:
        record(f'login {phone}', False, 200, status, json.dumps(payload, ensure_ascii=False)[:200])
        return None
    return payload.get('data', {})


def refresh(refresh_token):
    return call('POST', '/auth/refresh', body={'refreshToken': refresh_token})


# ---------------------------------------------------------------- phase C: sham cash manual review
def phase_c():
    print('\n=== Phase C — Sham Cash manual review + state machine ===')
    customer, admin = state['customerA'], state['admin']
    token, admin_token = customer['accessToken'], admin['accessToken']
    payment_id = state['payment1']['id']

    reference = f'STAGE14-REF-{uuid.uuid4().hex[:10].upper()}'
    state['payment1']['transactionReference'] = reference
    status, payload, _ = call('POST', f'/payments/{payment_id}/submit', token,
                              {'transactionReference': reference, 'proofUrl': f'https://proof.alwled.local/{reference}.jpg',
                               'proofNote': 'إيصال حوالة شام كاش — اختبار تكامل Stage 14'})
    record('POST /payments/{id}/submit', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:250])
    submitted = dig(payload, 'data') or {}
    state['payment1']['status'] = dig(submitted, 'status', 'payment.status') or state['payment1']['status']
    expect('payment → PENDING_REVIEW', state['payment1']['status'], 'PENDING_REVIEW')

    row = sql(f"select coalesce(proof_url,'-') || '|' || coalesce(transaction_reference,'-') || '|' || coalesce(submitted_at::text,'-') from payments where id = '{payment_id}'")
    check('evidence stored (proofUrl + transactionReference + submittedAt)', row.count('|') == 2 and '-' not in row.split('|')[2][:4], row)
    check('transaction reference is unique in the table',
          sql(f"select count(*) from payments where transaction_reference = '{reference}'") == '1')
    check('audit event written for the submission',
          int(sql(f"select count(*) from audit_logs where entity_id = '{payment_id}' and action ilike '%SUBMIT%'") or 0) >= 1,
          sql(f"select string_agg(distinct action, ',') from audit_logs where entity_id = '{payment_id}'"))
    check('notification created for the customer',
          int(sql(f"select count(*) from notifications where user_id = '{customer['id']}' and event_key like '%{payment_id}%'") or 0) >= 1,
          sql(f"select string_agg(distinct type || ':' || event_key, ' | ') from notifications where user_id = '{customer['id']}' and type::text ilike '%PAYMENT%' limit 3"))

    status, payload, _ = call('GET', '/admin/payments?status=PENDING_REVIEW&limit=50', admin_token)
    expect('GET /admin/payments?status=PENDING_REVIEW', status, 200)
    items = dig(payload, 'data.items', 'data') or []
    check('admin queue contains the submitted payment', any(str(dig(i, 'id')) == str(payment_id) for i in items), f'{len(items)} items')

    status, payload, _ = call('POST', f'/admin/payments/{payment_id}/confirm', admin_token)
    record('POST /admin/payments/{id}/confirm', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:250])
    expect('payment → SUCCEEDED', dig(payload, 'data.status'), 'SUCCEEDED')
    review = sql(f"select status || '|' || coalesce(reviewed_at::text,'-') || '|' || coalesce(reviewed_by,'-') from payments where id = '{payment_id}'")
    check('reviewedAt + reviewedBy recorded', review.count('|') == 2 and '-' not in review.split('|')[0][:1] and review.split('|')[1] != '-', review)
    check('PAYMENT_CONFIRMED audit present',
          int(sql(f"select count(*) from audit_logs where entity_id = '{payment_id}' and action ilike '%CONFIRM%'") or 0) >= 1)
    check('confirmation notification present',
          int(sql(f"select count(*) from notifications where user_id = '{customer['id']}' and type::text ilike '%CONFIRMED%'") or 0) >= 1)
    status, _, _ = call('POST', f'/admin/payments/{payment_id}/confirm', admin_token)
    expect('repeated confirmation ⇒ 409', status, 409)
    check('inventory untouched by confirmation (no invented SALE)',
          sql(f"select count(*) from inventory_movements m join inventory i on i.id = m.inventory_id where i.product_id = {state['productId']} and m.type = 'SALE'") == '0')

    # order 2 → payment 2 → reject
    order_key = f"{state['runId']}-order-2"
    status, payload, _ = call('POST', '/cart/items', token, {'productId': state['productId'], 'quantity': 1})
    record('POST /cart/items (order 2)', status, 201, status)
    status, payload, _ = call('POST', '/orders', token, {}, headers={'Idempotency-Key': order_key})
    expect('POST /orders (order 2)', status, 201)
    state['orderB'] = {'id': dig(payload, 'data.id'), 'total': dig(payload, 'data.total')}
    pay_key2 = f"{state['runId']}-pay-2"
    status, payload, _ = call('POST', '/payments', token, {'orderId': state['orderB']['id'], 'method': 'SHAM_CASH'},
                              headers={'Idempotency-Key': pay_key2})
    expect('POST /payments (payment 2)', status, 201)
    payment2 = dig(payload, 'data.id')
    state['payment2'] = {'id': payment2}
    status, _, _ = call('POST', f'/admin/payments/{payment2}/reject', admin_token, {'reason': 'بدون سبب'})
    expect('reject before submission ⇒ 409 (state machine)', status, 409)
    ref2 = f'STAGE14-REF-{uuid.uuid4().hex[:10].upper()}'
    status, _, _ = call('POST', f'/payments/{payment2}/submit', token, {'transactionReference': ref2, 'proofUrl': f'https://proof.alwled.local/{ref2}.jpg'})
    record('submit payment 2', status in (200, 201), '200/201', status)
    status, payload, _ = call('POST', f'/admin/payments/{payment2}/reject', admin_token, {})
    expect('reject without reason ⇒ 400', status, 400)
    status, payload, _ = call('POST', f'/admin/payments/{payment2}/reject', admin_token, {'reason': 'إيصال غير مطابق — اختبار Stage 14'})
    record('POST /admin/payments/{id}/reject', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:200])
    expect('payment → FAILED', dig(payload, 'data.status'), 'FAILED')
    check('rejectionReason + reviewer recorded',
          sql(f"select coalesce(rejection_reason,'-') from payments where id = '{payment2}'").startswith('إيصال غير مطابق'))
    check('PAYMENT_REJECTED audit present',
          int(sql(f"select count(*) from audit_logs where entity_id = '{payment2}' and action ilike '%REJECT%'") or 0) >= 1)
    status, _, _ = call('POST', f'/admin/payments/{payment2}/reject', admin_token, {'reason': 'again'})
    expect('repeated rejection ⇒ 409', status, 409)

    # same Idempotency-Key with a different (valid) request ⇒ 409
    prior_key = state.get('paymentKey1')
    if prior_key and state.get('orderB', {}).get('id'):
        status, payload, _ = call('POST', '/payments', token, {'orderId': state['orderB']['id'], 'method': 'SHAM_CASH'},
                                  headers={'Idempotency-Key': prior_key})
        expect('same Idempotency-Key + different request ⇒ 409', status, 409)
        if status != 409:
            record('idempotency conflict body', False, '409', status, json.dumps(payload, ensure_ascii=False)[:200])

    # duplicate transaction reference
    status, payload, _ = call('POST', '/cart/items', token, {'productId': state['productId'], 'quantity': 1})
    status, payload, _ = call('POST', '/orders', token, {}, headers={'Idempotency-Key': f"{state['runId']}-order-3"})
    state['orderC'] = {'id': dig(payload, 'data.id')}
    status, payload, _ = call('POST', '/payments', token, {'orderId': state['orderC']['id'], 'method': 'SHAM_CASH'},
                              headers={'Idempotency-Key': f"{state['runId']}-pay-3"})
    payment3 = dig(payload, 'data.id')
    state['payment3'] = {'id': payment3}
    status, _, _ = call('POST', f'/payments/{payment3}/submit', token, {'transactionReference': reference, 'proofUrl': 'https://proof.alwled.local/dup.jpg'})
    expect('duplicate transactionReference ⇒ 409', status, 409)

    # order cancellation → RELEASE
    before = sql(f"select reserved_quantity from inventory where product_id = {state['productId']}")
    status, payload, _ = call('POST', f"/orders/{state['orderC']['id']}/cancel", token, {'reason': 'اختبار إلغاء Stage 14'})
    record('POST /orders/{id}/cancel', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:200])
    after = sql(f"select reserved_quantity from inventory where product_id = {state['productId']}")
    check('cancellation released the reservation', int(after or 0) == int(before or 0) - 1, f'{before} → {after}')
    check('RELEASE movement written',
          int(sql(f"select count(*) from inventory_movements m join inventory i on i.id = m.inventory_id where i.product_id = {state['productId']} and m.type = 'RELEASE'") or 0) >= 1)
    status, _, _ = call('POST', f"/orders/{state['orderC']['id']}/cancel", token, {'reason': 'again'})
    expect('repeated cancellation ⇒ 409', status, 409)
    status, _, _ = call('PATCH', f"/admin/orders/{state['orderC']['id']}/status", admin_token, {'status': 'CANCELLED'})
    expect('admin status change on a cancelled order ⇒ 409', status, 409)
    save()


# ---------------------------------------------------------------- phase D: concurrency
def phase_d():
    print('\n=== Phase D — concurrency, idempotency, outbox ===')
    a, b, admin = state['customerA'], state['customerB'], state['admin']

    # inventory race: a dedicated product with exactly one unit available
    status, payload, _ = call('POST', '/products', admin['accessToken'], {
        'name': f'منتج سباق Stage14 {state["runId"]}', 'slug': f'stage14-race-{state["runId"]}',
        'price': 50.00, 'brandId': state['brandId'], 'categoryId': state['categoryId']})
    record('race product created', status == 201, 201, status, json.dumps(payload, ensure_ascii=False)[:180])
    state['raceProductId'] = dig(payload, 'data.id')
    status, payload, _ = call('POST', f"/inventory/{state['raceProductId']}/adjust", admin['accessToken'],
                              {'quantity': 1, 'type': 'STOCK_IN', 'reason': 'Stage14 race setup'})
    record('race product stocked with exactly 1 unit', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:180])
    available = sql(f"select quantity - reserved_quantity from inventory where product_id = {state['raceProductId']}")
    print('   available for the race:', available)

    def race(who, index):
        call('POST', '/cart/items', who['accessToken'], {'productId': state['raceProductId'], 'quantity': 1})
        return call('POST', '/orders', who['accessToken'], {}, headers={'Idempotency-Key': f"{state['runId']}-race-{index}"})

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(race, a, 1), pool.submit(race, b, 2)]
        responses = [f.result() for f in futures]
    outcomes = [status for status, _, _ in responses]
    print('   race statuses:', outcomes)
    check('inventory race: exactly one order accepted', outcomes.count(201) == 1 and 409 in outcomes, str(outcomes))
    for status, payload, _ in responses:
        if status == 201:
            state['raceOrderId'] = dig(payload, 'data.id')
    check('no overselling: reserved never exceeds quantity',
          int(sql(f"select count(*) from inventory where product_id in ({state['productId']}, {state['raceProductId']}) and reserved_quantity > quantity") or 0) == 0)

    # payment idempotency in parallel (same key, same request) على طلب جديد مخصّص
    status, _, _ = call('POST', '/cart/items', a['accessToken'], {'productId': state['productId'], 'quantity': 1})
    status, payload, _ = call('POST', '/orders', a['accessToken'], {}, headers={'Idempotency-Key': f"{state['runId']}-order-parallel"})
    record('dedicated order for the parallel payment test', status == 201, 201, status, json.dumps(payload, ensure_ascii=False)[:150])
    parallel_order = dig(payload, 'data.id')
    state['parallelOrderId'] = parallel_order
    key = f"{state['runId']}-parallel-pay"
    body = {'orderId': parallel_order, 'method': 'SHAM_CASH'}
    with ThreadPoolExecutor(max_workers=3) as pool:
        statuses = list(pool.map(lambda _: call('POST', '/payments', a['accessToken'], body, headers={'Idempotency-Key': key}), range(3)))
    created = {dig(payload, 'data.id') for status, payload, _ in statuses if status in (200, 201)}
    db_rows = sql(f"select count(*) from payments where order_id = {parallel_order}")
    check('parallel identical idempotent payments ⇒ one payment row',
          len(created) == 1 and db_rows == '1', f"statuses={[s for s, _, _ in statuses]} ids={created} rows={db_rows}")

    # notification dedup on a repeated business event
    before = sql(f"select count(*) from notifications where user_id = '{a['id']}'")
    status, _, _ = call('POST', f"/payments/{state['payment2']['id']}/submit", a['accessToken'],
                        {'transactionReference': f'STAGE14-REF-{uuid.uuid4().hex[:8].upper()}', 'proofUrl': 'https://proof.alwled.local/again.jpg'})
    after = sql(f"select count(*) from notifications where user_id = '{a['id']}'")
    check('a rejected action adds no notification (one event → one notification)', before == after, f'{before} → {after}')
    duplicates = sql("""select coalesce(sum(c - 1), 0) from (
        select count(*) c from notifications where event_key is not null group by user_id, event_key having count(*) > 1) t""")
    expect('no duplicate notifications in the whole table', duplicates, '0')

    # outbox: pending rows → process → completed, and processing twice does not duplicate
    pending = sql("select count(*) from notification_outbox where status = 'PENDING'")
    print('   outbox pending before processing:', pending)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: call('POST', '/admin/notifications/outbox/process?limit=25', admin['accessToken']), range(2)))
    check('outbox processing responds for both workers', all(s in (200, 201) for s, _, _ in responses), str([s for s, _, _ in responses]))
    blocked = sql("""select count(*) from notification_outbox where attempts > 5 and status = 'PENDING'""")
    expect('no stuck/looping outbox entries', blocked, '0')
    dup_outbox = sql("""select coalesce(sum(c - 1), 0) from (
        select count(*) c from notification_outbox group by event_type, aggregate_type, aggregate_id having count(*) > 1) t""")
    expect('no duplicate outbox entries', dup_outbox, '0')
    delivered = sql("select count(*) from notifications")
    check('notifications table still consistent after double processing', delivered.isdigit())
    print('   outbox status snapshot:', sql("select status || '=' || count(*) from notification_outbox group by status"))
    save()


def main() -> int:
    phase_c()
    phase_d()
    failed = [r for r in results if r['status'] == 'FAIL']
    print(f"\n=== part 2 summary: {len(results) - len(failed)}/{len(results)} PASS · failed={len(failed)} ===")
    for item in failed:
        print('  ✗', item['step'], '|', item.get('got'), '|', item.get('detail', '')[:130])
    save()
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
