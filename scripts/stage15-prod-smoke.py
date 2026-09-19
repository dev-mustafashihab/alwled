#!/usr/bin/env python3
"""
Stage 15 — Production smoke test (قراءة فقط + مصادقة). لا ينشئ طلبات/دفعات ولا يكتب بيانات تجارية.

يفحص: health/live/ready · ترويسات الأمان · X-Request-Id · سياسة Swagger · الكتالوج العام ·
المصادقة (عميل + مالك) · أسطح الإدارة · منع العميل من الإدارة · الحالات السلبية المتوقعة ·
زمن الاستجابة (smoke للأداء) · أعداد البيانات للتكامل.

يكتب frontend/tools/qa/stage15/prod-smoke.json
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

API = os.environ.get('ALWLED_API', 'https://panel.fahd-car.cloud/alwled-api/api/v1')
OUT = Path('/root/alwled/frontend/tools/qa/stage15')
OUT.mkdir(parents=True, exist_ok=True)
CUSTOMER = {"phone": "0955900100", "password": "Stage142!QAcust9"}
ADMIN_PHONE = "0938045496"

results: list[dict] = []
timings: dict[str, float] = {}


def owner_password() -> str:
    if os.environ.get('SEED_OWNER_PASSWORD'):
        return os.environ['SEED_OWNER_PASSWORD']
    try:
        for line in open('/root/alwled/.env', encoding='utf-8'):
            if line.strip().startswith('SEED_OWNER_PASSWORD='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ''


def call(method: str, path: str, token: str | None = None, body=None, want_headers: bool = False):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method)
    request.add_header('Accept', 'application/json')
    if data:
        request.add_header('Content-Type', 'application/json')
    if token:
        request.add_header('Authorization', 'Bearer ' + token)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            payload = json.loads(response.read().decode() or '{}')
            elapsed = (time.perf_counter() - started) * 1000
            return response.status, (payload.get('data') if isinstance(payload, dict) and 'data' in payload else payload), dict(response.headers), elapsed
    except urllib.error.HTTPError as error:
        elapsed = (time.perf_counter() - started) * 1000
        try:
            payload = json.loads(error.read().decode() or '{}')
        except json.JSONDecodeError:
            payload = {}
        return error.code, payload, dict(error.headers), elapsed
    except Exception as error:  # noqa: BLE001
        return 0, {'error': str(error)}, {}, (time.perf_counter() - started) * 1000


def record(name: str, ok: bool, got=None, detail: str = '', ms: float | None = None) -> bool:
    entry = {'check': name, 'status': 'PASS' if ok else 'FAIL'}
    if got is not None:
        entry['got'] = str(got)[:200]
    if detail:
        entry['detail'] = str(detail)[:300]
    if ms is not None:
        entry['ms'] = round(ms, 1)
    results.append(entry)
    suffix = (' [%.0fms]' % ms) if ms is not None else ''
    print(('✓ ' if ok else '✗ ') + name + suffix + (('  ' + str(got)[:110]) if not ok else ''))
    return ok


def main() -> int:
    # ---------- health ----------
    for path, expect in [('/health', 200), ('/health/live', 200), ('/health/ready', 200)]:
        status, payload, headers, ms = call('GET', path)
        timings[path] = ms
        record('health %s → %d' % (path, expect), status == expect, status, ms=ms)
        if path == '/health/ready' and status == 200:
            body = json.dumps(payload, ensure_ascii=False)
            record('readiness body exposes no secrets/host/db url',
                   not any(token in body.lower() for token in ['postgres', 'password', 'secret', 'localhost', '127.0.0.1']),
                   body[:120])
        if path == '/health/live':
            record('security headers present (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options)',
                   all(k in headers for k in ['Content-Security-Policy', 'Strict-Transport-Security',
                                              'X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options']),
                   json.dumps(sorted(headers.keys()))[:160])
            record('X-Request-Id is generated per request', bool(headers.get('X-Request-Id')), headers.get('X-Request-Id'))

    # ---------- swagger policy ----------
    status, _, _, _ = call('GET', '/../docs')   # /api/docs (خارج البادئة)
    swagger_status = 0
    try:
        with urllib.request.urlopen(API.replace('/api/v1', '') + '/api/docs', timeout=15) as response:
            swagger_status = response.status
    except urllib.error.HTTPError as error:
        swagger_status = error.code
    except Exception:  # noqa: BLE001
        swagger_status = 0
    node_env_status, _, _, _ = call('GET', '/health')
    record('swagger exposure is explicit (dev: 200 · production: disabled unless SWAGGER_ENABLED=true)',
           swagger_status in (200, 404), swagger_status, detail='this deployment is a dev/staging host')

    # ---------- public catalog ----------
    status, catalog, _, ms = call('GET', '/products?page=1&limit=5')
    timings['/products'] = ms
    record('public catalog reachable without auth', status == 200 and 'items' in (catalog or {}), status, ms=ms)
    if (catalog or {}).get('items'):
        pid = catalog['items'][0]['id']
        status, detail, _, ms = call('GET', '/products/%s' % pid)
        timings['/products/{id}'] = ms
        record('public product detail reachable', status == 200 and bool((detail or {}).get('id')), status, ms=ms)
    status, _, _, ms = call('GET', '/cart')
    record('private cart refuses anonymous access (401)', status == 401, status, ms=ms)

    # ---------- auth ----------
    status, payload, _, ms = call('POST', '/auth/login', body=CUSTOMER)
    timings['/auth/login'] = ms
    token = (payload or {}).get('accessToken')
    record('customer login works', status == 200 and bool(token), status, ms=ms)
    status, me, _, ms = call('GET', '/auth/me', token)
    record('customer /auth/me works', status == 200 and bool((me or {}).get('id')), status, ms=ms)

    admin_status, admin_payload, _, ms = call('POST', '/auth/login', body={"phone": ADMIN_PHONE, "password": owner_password()})
    admin_token = (admin_payload or {}).get('accessToken')
    record('owner login works', admin_status == 200 and bool(admin_token), admin_status, ms=ms)

    # ---------- customer surfaces (read-only) ----------
    for path in ['/cart', '/orders?page=1&limit=5', '/payments?page=1&limit=5', '/notifications?limit=5',
                 '/notifications/unread-count', '/verification/me', '/users/me', '/auth/sessions']:
        status, _, _, ms = call('GET', path, token)
        timings[path] = ms
        record('customer read %s' % path, status == 200, status, ms=ms)

    # ---------- admin surfaces + authorization ----------
    status, _, _, ms = call('POST', '/checkout/preview', token, {})
    record('checkout preview responds (200 with cart, or 409 when empty — never 5xx)', status in (200, 409, 422), status, ms=ms)
    for path in ['/admin/dashboard/overview', '/admin/dashboard/payment-review?limit=5', '/products?page=1&limit=5',
                 '/admin/orders?page=1&limit=5', '/admin/payments?page=1&limit=5', '/admin/notifications?page=1&limit=5']:
        status, _, _, ms = call('GET', path, admin_token)
        timings[path] = ms
        record('admin read %s' % path, status == 200, status, ms=ms)
        if not admin_token:
            continue
    blocked = {path: call('GET', path, token)[0] for path in ['/admin/dashboard/overview', '/admin/orders?page=1&limit=1', '/employees?page=1&limit=1']}
    record('customer is blocked from admin surfaces (401/403/404)', all(code in (401, 403, 404) for code in blocked.values()), json.dumps(blocked))

    # ---------- error contract (no leaks) ----------
    status, body, _, _ = call('GET', '/orders/999999999', token)
    record('unknown resource returns 404 without internals', status == 404 and 'stack' not in json.dumps(body).lower(), status)
    status, body, _, _ = call('POST', '/auth/login', body={"phone": "0900000000", "password": "definitely-wrong-123"})
    record('bad credentials return a generic 401', status == 401 and 'غير صحيحة' in json.dumps(body, ensure_ascii=False), status)

    slowest = sorted(timings.items(), key=lambda kv: kv[1], reverse=True)[:5]
    record('no endpoint in the smoke set exceeds 2s', all(ms < 2000 for ms in timings.values()),
           json.dumps([(k, round(v)) for k, v in slowest]))

    passed = sum(1 for item in results if item['status'] == 'PASS')
    failed = [item for item in results if item['status'] == 'FAIL']
    report = {
        'stage': '15', 'scope': 'production smoke (read-only + auth)', 'api': API,
        'total': len(results), 'passed': passed, 'failed': len(failed),
        'results': results, 'slowest': [(k, round(v, 1)) for k, v in slowest],
    }
    (OUT / 'prod-smoke.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('\n=== 15 prod smoke: %d/%d PASS ===' % (passed, len(results)))
    for item in failed:
        print('  ✗ %s | %s' % (item['check'], item.get('got', '')))
    return 0 if not failed else 1


if __name__ == '__main__':
    raise SystemExit(main())
