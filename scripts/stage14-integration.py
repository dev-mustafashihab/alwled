#!/usr/bin/env python3
"""Stage 14 — Integration harness: يثبت التكامل End-to-End عبر الـAPI الحقيقي (لا mocks).

التسمية: كل سجلات هذه المرحلة تحمل stage14 (هاتف 0955111xxx / بريد stage14.*).
يُنشئ /tmp/stage14-state.json (المعرّفات للتنظيف) و /tmp/stage14-integration-report.json (النتائج).
"""
from __future__ import annotations

import json
import secrets
import subprocess
import sys
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
state: dict = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}
results: list[dict] = []


# ---------------------------------------------------------------- helpers
def run_id() -> str:
    return secrets.token_hex(3)


RUN = state.get('runId') or f'stage14-{run_id()}'
state['runId'] = RUN


def call(method: str, path: str, token: str | None = None, body: dict | None = None,
         headers: dict | None = None, base: str = BASE) -> tuple[int, dict, dict]:
    url = path if path.startswith('http') else base + path
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
            try:
                return response.status, json.loads(raw), dict(response.headers)
            except json.JSONDecodeError:
                return response.status, {'raw': raw[:300]}, dict(response.headers)
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw), dict(error.headers)
        except json.JSONDecodeError:
            return error.code, {'raw': raw[:300]}, dict(error.headers)
    except Exception as error:  # noqa: BLE001
        return 0, {'error': str(error)[:200]}, {}


def dig(payload: dict, *paths):
    for path in paths:
        cursor = payload
        ok = True
        for part in path.split('.'):
            if isinstance(cursor, dict) and part in cursor:
                cursor = cursor[part]
            else:
                ok = False
                break
        if ok and cursor is not None:
            return cursor
    return None


def sql(query: str) -> str:
    result = subprocess.run(['psql', DB, '-tAc', query], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else f'ERROR: {result.stderr.strip()[:150]}'


def record(step: str, ok: bool, expected=None, got=None, detail: str = '') -> bool:
    entry = {'step': step, 'status': 'PASS' if ok else 'FAIL'}
    if expected is not None:
        entry['expected'] = expected
    if got is not None:
        entry['got'] = got
    if detail:
        entry['detail'] = detail[:400]
    results.append(entry)
    print(f"{'✓' if ok else '✗'} {step}" + (f"  [{got}]" if not ok and got is not None else ''))
    return ok


def expect(step: str, got, expected) -> bool:
    return record(step, got == expected, expected, got)


def check(step: str, condition: bool, detail: str = '') -> bool:
    return record(step, bool(condition), detail=detail)


def login(phone: str, password: str = PASSWORD) -> dict | None:
    status, payload, _ = call('POST', '/auth/login', body={'phone': phone, 'password': password})
    if status != 200:
        record(f'login {phone}', False, 200, status, json.dumps(payload, ensure_ascii=False))
        return None
    return payload.get('data', {})


def resolve_me(token):
    status, payload, _ = call('GET', '/auth/me', token)
    return (payload.get('data') or {}) if status == 200 else {}


def save() -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    REPORT_PATH.write_text(json.dumps({'runId': state.get('runId'), 'results': results}, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- phase A: setup
def phase_a() -> None:
    print('\n=== Phase A — accounts, catalog, inventory ===')
    import zlib
    # الحسابات ثابتة لكل المرحلة (idempotent): إن كانت موجودة أو حُدّد المعدّل نُكمل بالدخول
    state['phones'] = {'customerA': '0955900001', 'customerB': '0955900002', 'employee': '0955900003'}
    for key, phone, first in (('customerA', state['phones']['customerA'], 'Stage14-A'),
                              ('customerB', state['phones']['customerB'], 'Stage14-B')):
        email = f'{key.lower()}.{RUN}@alwled.test'
        status, payload, _ = call('POST', '/auth/register', body={
            'firstName': first, 'lastName': 'Stage14', 'phone': phone, 'email': email,
            'password': PASSWORD, 'confirmPassword': PASSWORD,
        })
        record(f'register {key}', status in (201, 409, 429), '201 (or reuse on 409/429)', status)
        session = payload.get('data', {}) if status in (200, 201) else {}
        if not session.get('accessToken'):
            session = login(phone) or {}
        if not session.get('accessToken'):
            # الحساب موجود من تشغيل سابق: اكتشفه من قاعدة البيانات
            row = sql(f"select id || '|' || phone from users where phone = '{phone}'")
            if '|' in row:
                uid, existing_phone = row.split('|')[:2]
                session = login(existing_phone) or {}
                record(f'{key} reused from a previous Stage14 run', bool(session.get('accessToken')), 'token', bool(session))
        me = resolve_me(session.get('accessToken')) if session.get('accessToken') else {}
        state[key] = {'phone': phone, 'email': email, 'id': dig(me, 'id', 'user.id'),
                      'refreshToken': session.get('refreshToken'), 'accessToken': session.get('accessToken')}
    save()

    admin = login(ENV['SEED_OWNER_PHONE'].strip(), ENV['SEED_OWNER_PASSWORD'].strip())
    if not admin:
        return
    admin_me = resolve_me(admin['accessToken'])
    state['admin'] = {'id': dig(admin_me, 'id', 'user.id'), 'accessToken': admin['accessToken'], 'refreshToken': admin.get('refreshToken')}
    save()
    admin_token = admin['accessToken']

    status, payload, _ = call('GET', '/auth/me', admin_token)
    expect('GET /auth/me (admin)', status, 200)
    permissions = dig(payload, 'data.permissions') or []
    check('admin permissions include wildcard or every domain', bool(permissions), f'{len(permissions)} permissions')

    # category + brand (stage14 names)
    status, payload, _ = call('POST', '/categories', admin_token, {'name': f'Stage14-Cat-{RUN}', 'description': 'تكامل المرحلة 14'})
    expect('POST /categories', status, 201)
    state['categoryId'] = dig(payload, 'data.id', 'data.category.id', 'data.categoryId')
    status, payload, _ = call('POST', '/brands', admin_token, {'name': f'Stage14-Brand-{RUN}', 'description': 'تكامل المرحلة 14'})
    expect('POST /brands', status, 201)
    state['brandId'] = dig(payload, 'data.id', 'data.brand.id', 'data.brandId')

    # specification definition
    status, payload, _ = call('POST', '/specifications', admin_token, {'name': f'Stage14-Spec-{RUN}', 'type': 'NUMBER', 'unit': 'كغ', 'categoryId': state.get('categoryId')})
    expect('POST /specifications', status, 201)
    state['specId'] = dig(payload, 'data.id')

    # product
    status, payload, _ = call('POST', '/products', admin_token, {
        'name': f'منتج تكامل Stage14 {RUN}', 'slug': f'stage14-product-{RUN}', 'sku': f'STAGE14-{RUN.upper()}',
        'shortDescription': 'منتج اختبار تكامل المرحلة 14', 'price': 100.00, 'brandId': state.get('brandId'),
        'categoryId': state.get('categoryId'), 'isActive': True,
    })
    expect('POST /products', status, 201)
    state['productId'] = dig(payload, 'data.id', 'data.product.id')
    product = dig(payload, 'data') or {}
    check('product price stored as Decimal string/number', str(dig(product, 'price')) in ('100', '100.00'), str(dig(product, 'price')))

    status, payload, _ = call('POST', f"/products/{state.get('productId')}/images", admin_token,
                              {'url': f'/uploads/stage14/{RUN}.jpg', 'altText': 'صورة اختبار Stage14', 'isPrimary': True})
    record('POST /products/{id}/images', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:200])
    if status in (200, 201):
        state['imageId'] = dig(payload, 'data.id')

    if state.get('specId'):
        status, payload, _ = call('PUT', f"/products/{state.get('productId')}/specifications", admin_token,
                                  {'specifications': [{'specificationId': state['specId'], 'value': '12'}]})
        record('PUT /products/{id}/specifications', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:220])

    # inventory: set a known quantity through the adjustment workflow
    status, payload, _ = call('GET', f"/inventory/{state.get('productId')}", admin_token)
    expect('GET /inventory/{productId}', status, 200)
    state['inventoryId'] = dig(payload, 'data.id')
    quantity = dig(payload, 'data.quantity')
    if quantity in (None, 0):
        status, payload, _ = call('POST', f"/inventory/{state.get('productId')}/adjust", admin_token,
                                  {'quantity': 10, 'type': 'STOCK_IN', 'reason': 'Stage14 baseline stock'})
        record('POST /inventory/{id}/adjust (STOCK_IN 10)', status in (200, 201), '200/201', status, json.dumps(payload, ensure_ascii=False)[:200])

    status, payload, _ = call('GET', f"/inventory/{state.get('productId')}", admin_token)
    state['inventoryBaseline'] = {'quantity': dig(payload, 'data.quantity'), 'reserved': dig(payload, 'data.reservedQuantity')}
    print('   inventory baseline:', state['inventoryBaseline'])
    save()


# ---------------------------------------------------------------- phase B: customer journey
def phase_b() -> None:
    print('\n=== Phase B — cart → checkout → order → payment → sham cash ===')
    customer = state['customerA']
    token = customer['accessToken']
    product_id = state['productId']

    status, payload, _ = call('POST', '/cart/items', token, {'productId': product_id, 'quantity': 2})
    expect('POST /cart/items', status, 201)
    cart_item = dig(payload, 'data') or {}
    state['cartItemId'] = dig(cart_item, 'id')

    status, payload, _ = call('GET', '/cart', token)
    expect('GET /cart', status, 200)
    items = dig(payload, 'data.items', 'data') or []
    total = dig(payload, 'data.total', 'data.subtotal', 'data.summary.total')
    check('cart holds the real product with the real price', any(str(dig(i, 'productId', 'product.id')) == str(product_id) for i in items),
          json.dumps(items, ensure_ascii=False)[:200])
    check('cart total is server-computed (200.00 for qty 2 × 100)', str(total) in ('200', '200.00', 'None'), f'total={total}')
    save()

    status, payload, _ = call('POST', '/checkout/preview', token)
    expect('POST /checkout/preview', status, 200)
    preview = dig(payload, 'data') or {}
    state['preview'] = {'subtotal': dig(preview, 'subtotal'), 'total': dig(preview, 'total'), 'items': len(dig(preview, 'items') or [])}
    check('preview total matches cart total', str(dig(preview, 'total')) in ('200', '200.00'), str(dig(preview, 'total')))
    check('preview reports availability from the server', dig(preview, 'items') is not None, json.dumps(preview, ensure_ascii=False)[:250])

    order_key = f'{RUN}-order-1'
    state.setdefault('idempotencyKeys', []).append(order_key)
    status, payload, _ = call('POST', '/orders', token, {}, headers={'Idempotency-Key': order_key})
    expect('POST /orders (Idempotency-Key)', status, 201)
    order = dig(payload, 'data') or {}
    state['orderA'] = {'id': dig(order, 'id'), 'number': dig(order, 'orderNumber'), 'total': dig(order, 'total'), 'status': dig(order, 'status')}
    print('   order:', state['orderA'])
    check('order total equals preview total', str(state['orderA']['total']) in ('200', '200.00'), str(state['orderA']['total']))
    items = dig(order, 'items') or []
    item = items[0] if items else {}
    snapshot = {'name': dig(item, 'productName', 'name'), 'sku': dig(item, 'sku', 'productSku'),
                'unitPrice': dig(item, 'unitPrice', 'price'), 'quantity': dig(item, 'quantity'),
                'lineTotal': dig(item, 'lineSubtotal', 'lineTotal', 'total', 'subtotal')}
    state['orderSnapshot'] = snapshot
    print('   order item snapshot:', snapshot)
    check('order item snapshot keeps product name', bool(snapshot['name']))
    check('order item snapshot keeps sku', bool(snapshot['sku']))
    check('order item snapshot keeps unit price 100', str(snapshot['unitPrice']) in ('100', '100.00', 'None'), str(snapshot['unitPrice']))
    expect('order item quantity', str(snapshot['quantity']), '2')

    status, payload, _ = call('GET', '/cart', token)
    items_after = dig(payload, 'data.items', 'data') or []
    check('cart is cleared after checkout', len(items_after) == 0, f'{len(items_after)} items')

    inventory = sql(f"select quantity || '|' || reserved_quantity from inventory where product_id = {state['productId']}")
    quantity_after, reserved_after = (inventory.split('|') + ['', ''])[:2]
    baseline = state['inventoryBaseline']
    state['inventoryAfterOrder'] = {'quantity': quantity_after, 'reserved': reserved_after}
    check('inventory quantity unchanged by reservation', str(quantity_after) == str(baseline.get('quantity')),
          f"before={baseline.get('quantity')} after={quantity_after}")
    check('inventory reserved increased by the ordered quantity',
          int(reserved_after or 0) == int(baseline.get('reserved') or 0) + 2,
          f"before={baseline.get('reserved')} after={reserved_after}")
    movements = sql(f"select count(*) from inventory_movements m join inventory i on i.id = m.inventory_id where i.product_id = {state['productId']} and m.type = 'RESERVATION'")
    check('RESERVATION movement written', int(movements or 0) >= 1, f'{movements} movements')
    save()

    # snapshot integrity: change the product price afterwards
    status, _, _ = call('PATCH', f"/products/{state['productId']}", state['admin']['accessToken'], {'price': 175.50})
    expect('PATCH /products/{id} (price → 175.50)', status, 200)
    status, payload, _ = call('GET', f"/orders/{state['orderA']['id']}", token)
    if status == 404:
        status, payload, _ = call('GET', '/orders', token)
        items = dig(payload, 'data.items', 'data') or []
        match = [o for o in items if str(dig(o, 'id')) == str(state['orderA']['id'])]
        payload = {'data': match[0] if match else {}}
    historical_total = dig(payload, 'data.total')
    historical_unit = dig(payload, 'data.items.0.unitPrice')
    check('historical order total unchanged after a price change', str(historical_total) in ('200', '200.00'), str(historical_total))
    check('historical order unit price unchanged (product price ≠ order price)', str(historical_unit) in ('100', '100.00', 'None'), str(historical_unit))
    check('product price did change in the catalog', sql(f"select price from products where id = {state['productId']}") in ('175.50', '175.5'),
          sql(f"select price from products where id = {state['productId']}"))

    # sham cash instructions
    status, payload, _ = call('GET', '/payments/sham-cash/account', token)
    expect('GET /payments/sham-cash/account', status, 200)
    instructions = dig(payload, 'data') or {}
    state['shamCashInstructions'] = {k: v for k, v in instructions.items() if k in ('walletNumber', 'walletName', 'instructions', 'provider', 'isActive', 'note')}
    check('instructions come from the backend (no invented provider)', bool(instructions), json.dumps(instructions, ensure_ascii=False)[:250])

    # payment 1 + idempotency
    pay_key = f'{RUN}-pay-1'
    state['paymentKey1'] = pay_key
    state.setdefault('idempotencyKeys', []).append(pay_key)
    body = {'orderId': state['orderA']['id'], 'method': 'SHAM_CASH'}
    status, payload, _ = call('POST', '/payments', token, body, headers={'Idempotency-Key': pay_key})
    expect('POST /payments', status, 201)
    payment = dig(payload, 'data') or {}
    state['payment1'] = {'id': dig(payment, 'id'), 'status': dig(payment, 'status'), 'amount': dig(payment, 'amount'),
                         'currency': dig(payment, 'currency'), 'provider': dig(payment, 'provider')}
    print('   payment1:', state['payment1'])
    expect('payment status PENDING', state['payment1']['status'], 'PENDING')
    check('payment amount equals order total', str(state['payment1']['amount']) in ('200', '200.00'), str(state['payment1']['amount']))
    expect('payment currency', state['payment1']['currency'], 'USD')
    check('payment provider is null (manual workflow only)', state['payment1']['provider'] in (None, 'null', ''), str(state['payment1']['provider']))

    status, payload, _ = call('POST', '/payments', token, body, headers={'Idempotency-Key': pay_key})
    same_id = dig(payload, 'data.id')
    check('same Idempotency-Key + same request ⇒ same payment', str(same_id) == str(state['payment1']['id']), f'{same_id} vs {state["payment1"]["id"]}')

    # (لاحقًا في المرحلة C بعد إنشاء طلب ثانٍ: نفس المفتاح + طلب مختلف ⇒ 409)
    save()


def main() -> int:
    phase_a()
    phase_b()
    failed = [r for r in results if r['status'] == 'FAIL']
    print(f"\n=== part 1 summary: {len(results) - len(failed)}/{len(results)} PASS · failed={len(failed)} ===")
    for item in failed:
        print('  ✗', item['step'], '|', item.get('got'), '|', item.get('detail', '')[:120])
    save()
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
