#!/usr/bin/env python3
"""Stage 13 — Functional smoke + performance smoke على البيئة الحقيقية.

1) حساب عميل (يُنشأ ثم يُنظَّف): login · account · orders · payments · notifications · verification
   + مسارات إدارية يجب أن تُرفض (403) + لوحة الواجهة تُظهر صفحة غير مصرح.
2) حساب موظف محدود (DEMO_TRIAL): إجراء مسموح ينجح، وإجراء ممنوع 403 من الخادم (وليس إخفاء زر فقط).
3) Performance smoke: لا طلبات مكرّرة، لا نمو DOM عبر التنقلات، لا دورات شبكة في وضع الخمول.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

API = 'http://127.0.0.1:3100/api/v1'
URL = 'https://panel.fahd-car.cloud/alwled/admin/'
ENV = dict(re.findall(r'^(\w+)=(.*)$', Path('/root/alwled/.env').read_text(), re.M))
STAMP = str(int(time.time()))[-7:]
OUT = Path(__file__).resolve().parent / 'qa'
OUT.mkdir(parents=True, exist_ok=True)


def api(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        payload = json.load(urllib.request.urlopen(request))
        return {'status': 200, 'data': payload}
    except urllib.error.HTTPError as error:
        return {'status': error.code, 'data': json.loads(error.read() or b'{}')}


def main() -> int:
    report = {'customer': {}, 'restricted': {}, 'performance': {}, 'issues': []}

    owner = api('POST', '/auth/login', body={'phone': ENV['SEED_OWNER_PHONE'].strip(), 'password': ENV['SEED_OWNER_PASSWORD'].strip()})
    owner_token = owner['data']['data']['accessToken']

    # ---------------- customer account (created + cleaned up) ----------------
    phone = f'0777{STAMP}'
    password = 'Smoke!Pass123'
    registered = api('POST', '/auth/register', body={
        'firstName': 'فحص', 'lastName': 'عميل', 'phone': phone, 'password': password, 'confirmPassword': password,
    })
    customer_id = registered['data'].get('data', {}).get('user', {}).get('id') or registered['data'].get('data', {}).get('id')
    if not customer_id:
        with_id = api('GET', f'/users?search={phone}', token=owner_token)
        customer_id = next((u['id'] for u in with_id['data'].get('data', {}).get('items', []) if u.get('phone') == phone), None)
    report['customer']['created'] = {'phone': phone, 'id': customer_id, 'registerStatus': registered['status']}

    login = api('POST', '/auth/login', body={'phone': phone, 'password': password})
    customer_token = login['data']['data']['accessToken']
    report['customer']['allowed'] = {
        'GET /auth/me': api('GET', '/auth/me', token=customer_token)['status'],
        'GET /users/me': api('GET', '/users/me', token=customer_token)['status'],
        'GET /orders': api('GET', '/orders?limit=5', token=customer_token)['status'],
        'GET /payments': api('GET', '/payments?limit=5', token=customer_token)['status'],
        'GET /notifications': api('GET', '/notifications?limit=5', token=customer_token)['status'],
        'GET /verification/me': api('GET', '/verification/me', token=customer_token)['status'],
        'GET /cart': api('GET', '/cart', token=customer_token)['status'],
        'GET /notifications/preferences': api('GET', '/notifications/preferences', token=customer_token)['status'],
    }
    report['customer']['forbidden'] = {
        'GET /admin/dashboard/overview': api('GET', '/admin/dashboard/overview', token=customer_token)['status'],
        'GET /admin/orders': api('GET', '/admin/orders', token=customer_token)['status'],
        'GET /employees': api('GET', '/employees', token=customer_token)['status'],
        'GET /roles': api('GET', '/roles', token=customer_token)['status'],
        'GET /audit': api('GET', '/audit', token=customer_token)['status'],
        'POST /products': api('POST', '/products', token=customer_token, body={'name': 'x', 'price': 1, 'categoryId': 1, 'brandId': 1})['status'],
        'POST /roles': api('POST', '/roles', token=customer_token, body={'name': 'HACK'})['status'],
    }
    for label, status in report['customer']['forbidden'].items():
        if status not in (401, 403):
            report['issues'].append(f'customer was not blocked on {label} (status {status})')
    for label, status in report['customer']['allowed'].items():
        if status != 200:
            report['issues'].append(f'customer could not use {label} (status {status})')

    # ---------------- restricted staff account (DEMO_TRIAL) ------------------
    trial = api('POST', '/auth/login', body={'phone': '0966112233', 'password': 'Alwled@Demo2026'})
    trial_token = trial['data']['data']['accessToken']
    report['restricted']['allowedRead'] = {
        'GET /admin/dashboard/overview': api('GET', '/admin/dashboard/overview', token=trial_token)['status'],
        'GET /products': api('GET', '/products?limit=2', token=trial_token)['status'],
        'GET /inventory': api('GET', '/inventory?limit=2', token=trial_token)['status'],
        'GET /admin/orders': api('GET', '/admin/orders?limit=2', token=trial_token)['status'],
        'GET /admin/payments': api('GET', '/admin/payments?limit=2', token=trial_token)['status'],
        'GET /admin/notifications/summary': api('GET', '/admin/notifications/summary', token=trial_token)['status'],
        'GET /employees': api('GET', '/employees?limit=2', token=trial_token)['status'],
        'GET /roles': api('GET', '/roles', token=trial_token)['status'],
        'GET /audit': api('GET', '/audit?limit=2', token=trial_token)['status'],
    }
    report['restricted']['forbidden'] = {
        'POST /roles': api('POST', '/roles', token=trial_token, body={'name': 'HACK2'})['status'],
        'PATCH /admin/orders/1/status': api('PATCH', '/admin/orders/1/status', token=trial_token, body={'status': 'CONFIRMED'})['status'],
        'POST /admin/payments/1/confirm': api('POST', '/admin/payments/1/confirm', token=trial_token, body={})['status'],
        'PATCH /users/1/status': api('PATCH', '/users/1/status', token=trial_token, body={'isActive': False})['status'],
        'POST /admin/verifications/1/verify': api('POST', '/admin/verifications/1/verify', token=trial_token, body={})['status'],
        'DELETE /products/1': api('DELETE', '/products/1', token=trial_token)['status'],
    }
    for label, status in report['restricted']['forbidden'].items():
        if status not in (401, 403, 404):
            report['issues'].append(f'restricted account was not blocked on {label} (status {status})')
    for label, status in report['restricted']['allowedRead'].items():
        if status != 200:
            report['issues'].append(f'restricted account could not read {label} (status {status})')

    # ---------------- browser: customer sees 403 page, restricted sees gates --
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])

        cust_ctx = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        cust_page = cust_ctx.new_page()
        errors = []
        cust_page.on('pageerror', lambda e: errors.append(str(e)[:150]))
        cust_page.goto(URL, wait_until='networkidle')
        cust_page.wait_for_selector('.auth-card', timeout=30000)
        cust_page.fill('input[name="identifier"]', phone)
        cust_page.fill('input[name="password"]', password)
        cust_page.click('.auth-card .btn--primary')
        cust_page.wait_for_selector('.app-sidebar:not([hidden])', timeout=30000)
        cust_page.wait_for_timeout(1500)
        report['customer']['navItems'] = cust_page.locator('.nav-item__text').all_inner_texts()
        cust_page.evaluate("() => window.ALW.nav.go('/dashboard')")
        cust_page.wait_for_timeout(1500)
        report['customer']['forbiddenPage'] = cust_page.evaluate("() => document.querySelector('.state__title')?.textContent || ''")
        cust_page.screenshot(path=str(OUT / 'functional-customer-forbidden.png'))

        admin_ctx = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        admin_page = admin_ctx.new_page()
        admin_page.goto(URL, wait_until='networkidle')
        admin_page.wait_for_selector('.auth-card', timeout=30000)
        admin_page.fill('input[name="identifier"]', '0966112233')
        admin_page.fill('input[name="password"]', 'Alwled@Demo2026')
        admin_page.click('.auth-card .btn--primary')
        admin_page.wait_for_selector('.app-sidebar:not([hidden])', timeout=30000)
        admin_page.wait_for_timeout(1500)
        admin_page.evaluate("() => window.ALW.nav.go('/roles')")
        admin_page.wait_for_timeout(1800)
        roles_create = admin_page.get_by_text('إضافة دور').count()
        admin_page.evaluate("() => window.ALW.nav.go('/products')")
        admin_page.wait_for_timeout(2000)
        report['restricted']['uiGates'] = {
            'roles_create_button': roles_create,
            'products_create_button': admin_page.get_by_text('إضافة منتج').count(),
            'product_action_buttons': admin_page.locator('#content .table__cell-actions button').count(),
            'delete_buttons_anywhere': admin_page.locator('.table__cell-actions button[title*="حذف"]').count(),
        }

        # ---------------- performance smoke (owner context) -------------------
        perf_ctx = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        perf_page = perf_ctx.new_page()
        requests = []
        perf_page.on('request', lambda r: requests.append(r.url.split('3100')[-1].split('/alwled-api')[-1]))
        perf_page.goto(URL, wait_until='networkidle')
        perf_page.wait_for_selector('.auth-card', timeout=30000)
        perf_page.fill('input[name="identifier"]', ENV['SEED_OWNER_PHONE'].strip())
        perf_page.fill('input[name="password"]', ENV['SEED_OWNER_PASSWORD'].strip())
        perf_page.click('.auth-card .btn--primary')
        perf_page.wait_for_selector('.app-sidebar:not([hidden])', timeout=30000)
        perf_page.wait_for_timeout(2500)

        requests.clear()
        perf_page.evaluate("() => window.ALW.nav.go('/dashboard')")
        perf_page.wait_for_timeout(2500)
        dashboard_calls = [r for r in requests if r.startswith('/api/')]
        report['performance']['dashboardRequests'] = len(dashboard_calls)
        report['performance']['duplicateRequests'] = sorted({r for r in dashboard_calls if dashboard_calls.count(r) > 1})

        nodes_before = perf_page.evaluate('() => document.querySelectorAll("*").length')
        for _ in range(10):
            perf_page.evaluate("() => window.ALW.nav.go('/products')")
            perf_page.wait_for_timeout(500)
            perf_page.evaluate("() => window.ALW.nav.go('/dashboard')")
            perf_page.wait_for_timeout(500)
        perf_page.wait_for_timeout(1500)
        nodes_after = perf_page.evaluate('() => document.querySelectorAll("*").length')
        report['performance']['domNodes'] = {'before': nodes_before, 'after': nodes_after, 'growth': nodes_after - nodes_before}

        requests.clear()
        perf_page.wait_for_timeout(6000)
        idle_calls = [r for r in requests if r.startswith('/api/')]
        report['performance']['idleRequests'] = len(idle_calls)

        # notification bell: opening twice must not stack panels
        perf_page.click('.bell .icon-btn')
        perf_page.wait_for_timeout(600)
        perf_page.keyboard.press('Escape')
        perf_page.click('.bell .icon-btn')
        perf_page.wait_for_timeout(600)
        report['performance']['bellPanels'] = perf_page.locator('.notif-panel').count()
        perf_page.keyboard.press('Escape')

        report['performance']['consoleErrors'] = errors[:5]
        if report['performance']['duplicateRequests']:
            report['issues'].append(f"duplicate requests on dashboard: {report['performance']['duplicateRequests']}")
        if report['performance']['domNodes']['growth'] > 400:
            report['issues'].append(f"DOM growth after 10 navigations: {report['performance']['domNodes']}")
        if report['performance']['idleRequests'] > 0:
            report['issues'].append(f"{report['performance']['idleRequests']} network calls while idle")
        if report['performance']['bellPanels'] > 1:
            report['issues'].append('multiple notification panels stacked')

        browser.close()

    # ---------------- cleanup: the smoke customer account --------------------
    if customer_id:
        cleanup = api('PATCH', f'/users/{customer_id}/status', token=owner_token, body={'isActive': False})
        report['customer']['cleanup'] = {'deactivated': cleanup['status']}

    (OUT / 'functional-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps(report, ensure_ascii=False, indent=1)[:3000])
    print('\nISSUES:', report['issues'] or 'none')
    return 1 if report['issues'] else 0


if __name__ == '__main__':
    sys.exit(main())
