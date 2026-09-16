#!/usr/bin/env python3
"""فحص الجودة البصري والسلوكي للوحة الإدارة عبر Playwright (Chromium).

يفعل:
  1) لقطة صفحة الدخول + تسجيل دخول حقيقي بالمالك.
  2) يمر على كل الصفحات ويسجّل: حالة العرض، أخطاء console، أخطاء الصفحة.
  3) قياسات استجابة: Desktop 1440 · Tablet 1024/768 · Mobile 430/390/375.
  4) فحص بوابة الصلاحيات بمستخدم حقيقي محدود الصلاحية (يُنشأ ثم يُحذف).
  5) فحص سلوك 401 (بعد إبطال الجلسة) و403 (صفحة غير مصرح).

يُشغَّل: python3 frontend/tools/qa.py [--base http://127.0.0.1:5173] [--api http://127.0.0.1:3100/api/v1]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / 'qa'
OUT.mkdir(exist_ok=True)
ENV = dict(re.findall(r'^(\w+)=(.*)$', Path('/root/alwled/.env').read_text(), re.M))
OWNER_PHONE = ENV['SEED_OWNER_PHONE'].strip()
OWNER_PASSWORD = ENV['SEED_OWNER_PASSWORD'].strip()
STAMP = str(int(time.time()))[-7:]


def api(method: str, path: str, token: str | None = None, body: dict | None = None, base: str = ''):
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        payload = json.load(urllib.request.urlopen(request))
    except urllib.error.HTTPError as error:
        payload = {'__status': error.code, '__body': error.read()[:200].decode('utf8', 'replace')}
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5173')
    parser.add_argument('--api', default='http://127.0.0.1:3100/api/v1')
    parser.add_argument('--headed', action='store_true')
    args = parser.parse_args()

    report: dict = {'pages': [], 'errors': [], 'responsive': [], 'security': [], 'screenshots': []}
    from playwright.sync_api import sync_playwright

    login = api('POST', '/auth/login', body={'phone': OWNER_PHONE, 'password': OWNER_PASSWORD}, base=args.api)
    owner_token = login['data']['accessToken']

    # ---- real limited user (created and removed by this script) --------------
    permissions = api('GET', '/permissions', token=owner_token, base=args.api)
    flat = permissions['data']['flat']
    orders_read_id = next(item['id'] for item in flat if item['key'] == 'orders.read')
    products_read_id = next(item['id'] for item in flat if item['key'] == 'products.read')
    role_name = f'QATEST{STAMP}'
    role = api('POST', '/roles', token=owner_token, base=args.api, body={
        'name': role_name, 'description': 'دور فحص واجهة (يُحذف بعد الفحص)',
        'permissionIds': [orders_read_id, products_read_id],
    })
    role_id = role.get('data', {}).get('id')
    limited_phone = f'0755{STAMP}'
    limited_password = 'Qa!Test12345'
    employee = api('POST', '/employees', token=owner_token, base=args.api, body={
        'firstName': 'فحص', 'lastName': 'محدود', 'phone': limited_phone,
        'password': limited_password, 'roleName': role_name,
    })
    employee_id = employee.get('data', {}).get('id')
    if not role_id or not employee_id:
        print(json.dumps({'setup_error': {'role': role, 'employee': employee}}, ensure_ascii=False)[:600])
        return 1
    report['security'].append({'created': {'role': role_name, 'employee': limited_phone}})

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headed, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='ar', timezone_id='UTC')
        page = context.new_page()
        console_errors: list[str] = []
        page.on('console', lambda message: console_errors.append(f'{message.type}: {message.text}') if message.type in ('error',) else None)
        page.on('pageerror', lambda error: console_errors.append(f'pageerror: {error}'))

        url = f'{args.base}/?api={args.api}'

        def save():
            (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))

        def goto_route(page, route):
            # the api base travels in the query string, so every navigation must carry it
            page.goto(f'{args.base}/?api={args.api}#/{route}', wait_until='domcontentloaded')

        def login_as(page, phone=OWNER_PHONE, password=OWNER_PASSWORD):
            page.goto(url, wait_until='networkidle')
            page.wait_for_selector('.auth-card', timeout=20000)
            page.fill('input[name="identifier"]', phone)
            page.fill('input[name="password"]', password)
            page.click('.auth-card .btn--primary')
            page.wait_for_selector('.app-sidebar:not([hidden])', timeout=25000)
            page.wait_for_timeout(1200)

        def ensure_session(page):
            if page.locator('.auth-card').count():
                report['errors'].append({'recovered': 'session lost mid-run, logged in again'})
                login_as(page)

        def shot(name: str):
            path = OUT / f'{name}.png'
            page.screenshot(path=str(path), full_page=False)
            report['screenshots'].append(str(path))
            return path

        # ---------------- 1) login page ----------------
        page.goto(url, wait_until='networkidle')
        page.wait_for_selector('.auth-card', timeout=20000)
        report['pages'].append({'page': 'login', 'title': page.title(), 'card': True})
        shot('01-login-desktop')
        save()

        # validation: empty submit shows errors, no request needed
        page.click('.auth-card .btn--primary')
        page.wait_for_timeout(300)
        field_errors = page.locator('.field__error').count()
        report['pages'].append({'page': 'login-validation', 'fieldErrors': field_errors})

        # wrong password → generic error, no enumeration
        page.fill('input[name="identifier"]', OWNER_PHONE)
        page.fill('input[name="password"]', 'WrongPass!000')
        page.click('.auth-card .btn--primary')
        page.wait_for_selector('.auth-card .alert--danger', timeout=15000)
        generic = page.inner_text('.auth-card .alert--danger')
        report['security'].append({'login_wrong_password': generic[:120], 'status': 'generic-error-shown'})
        shot('02-login-error')

        # correct password → dashboard
        page.fill('input[name="password"]', OWNER_PASSWORD)
        page.click('.auth-card .btn--primary')
        page.wait_for_selector('.app-sidebar:not([hidden])', timeout=25000)
        page.wait_for_timeout(2500)
        report['pages'].append({'page': 'dashboard', 'kpis': page.locator('.kpi').count(), 'navItems': page.locator('.nav-item').count()})
        shot('03-dashboard-desktop')

        # ---------------- 2) walk every page ----------------
        routes = [
            'dashboard', 'analytics', 'products', 'categories', 'brands', 'specifications', 'inventory',
            'orders', 'payments', 'payments/review', 'customers', 'verification',
            'notifications', 'admin/notifications', 'employees', 'roles', 'audit', 'account',
        ]
        for index, route in enumerate(routes, start=1):
            ensure_session(page)
            goto_route(page, route)
            page.wait_for_timeout(1800)
            info = {
                'page': route,
                'heading': (page.locator('.page-head__title, .app-header__title').first.inner_text() if page.locator('.page-head__title, .app-header__title').count() else ''),
                'cards': page.locator('.card').count(),
                'rows': page.locator('.table tbody tr').count(),
                'empty': page.locator('.state').count(),
                'errorState': page.locator('.state--error').count(),
            }
            report['pages'].append(info)
            if index % 6 == 0 or route in ('dashboard', 'products', 'orders', 'roles'):
                shot(f'04-{route.replace("/", "-")}')
            if info['errorState']:
                report['errors'].append({'page': route, 'state': 'error-state-visible'})
            save()

        # idle check: notifications bell
        ensure_session(page)
        page.hover('.bell')
        page.click('.bell .icon-btn', timeout=15000)
        page.wait_for_timeout(900)
        report['pages'].append({'page': 'notifications-bell', 'panel': page.locator('.notif-panel').count()})
        shot('05-notifications-panel')
        page.keyboard.press('Escape')

        save()
        # ---------------- 3) responsive ----------------
        for label, width, height in [('desktop-1440', 1440, 900), ('desktop-1280', 1280, 800),
                                     ('tablet-1024', 1024, 768), ('tablet-768', 768, 1024),
                                     ('mobile-430', 430, 900), ('mobile-390', 390, 844), ('mobile-375', 375, 667)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.goto(f'{args.base}/#/products', wait_until='domcontentloaded')
            page.wait_for_timeout(1500)
            overflow = page.evaluate('({ doc: document.documentElement.scrollWidth, win: window.innerWidth })')
            report['responsive'].append({
                'viewport': label,
                'scrollWidth': overflow['doc'],
                'innerWidth': overflow['win'],
                'horizontalOverflow': bool(overflow['doc'] > overflow['win'] + 1),
                'sidebarVisible': page.locator('.app-sidebar').is_visible(),
            })
            save()
            if label in ('tablet-768', 'mobile-390'):
                shot(f'06-products-{label}')
                # mobile drawer
                ensure_session(page)
                page.click('.sidebar-toggle-mobile')
                page.wait_for_timeout(600)
                drawer_open = page.locator('.app-sidebar.is-open').count() == 1
                report['responsive'].append({'viewport': label, 'drawerOpen': drawer_open})
                shot(f'07-drawer-{label}')
                if page.locator('.sidebar-scrim').count():
                    page.click('.sidebar-scrim')

        # dashboard on mobile (KPI stacking)
        page.set_viewport_size({'width': 390, 'height': 844})
        goto_route(page, 'dashboard')
        page.wait_for_timeout(2200)
        shot('08-dashboard-mobile')

        # ---------------- 4) permission gating with a real limited user --------
        limited = api('POST', '/auth/login', body={'phone': limited_phone, 'password': limited_password}, base=args.api)
        limited_token = limited['data']['accessToken']

        # 403 from the API for a forbidden page
        admin_orders = api('GET', '/admin/notifications?limit=1', token=limited_token, base=args.api)
        report['security'].append({'limited_user_admin_notifications_status': admin_orders.get('__status')})
        dashboard_call = api('GET', '/admin/dashboard/overview', token=limited_token, base=args.api)
        report['security'].append({'limited_user_dashboard_status': dashboard_call.get('__status')})

        limited_context = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='ar')
        limited_page = limited_context.new_page()
        limited_page.goto(url, wait_until='networkidle')
        limited_page.wait_for_selector('.auth-card', timeout=15000)
        limited_page.fill('input[name="identifier"]', limited_phone)
        limited_page.fill('input[name="password"]', limited_password)
        limited_page.click('.auth-card .btn--primary')
        limited_page.wait_for_selector('.app-sidebar', timeout=20000)
        limited_page.wait_for_timeout(1200)
        nav_labels = limited_page.locator('.nav-item__text').all_inner_texts()
        report['security'].append({'limited_user_nav_items': nav_labels})
        limited_page.screenshot(path=str(OUT / '09-limited-user-nav.png'))
        report['screenshots'].append(str(OUT / '09-limited-user-nav.png'))

        # direct navigation to a forbidden route → forbidden page (client gate)
        limited_page.goto(f'{args.base}/?api={args.api}#/dashboard', wait_until='domcontentloaded')
        limited_page.wait_for_timeout(1200)
        forbidden_visible = limited_page.locator('.state').count() > 0
        forbidden_text = limited_page.inner_text('.state__title') if forbidden_visible else ''
        report['security'].append({'limited_user_forbidden_page': forbidden_text})
        limited_page.screenshot(path=str(OUT / '10-limited-forbidden.png'))
        report['screenshots'].append(str(OUT / '10-limited-forbidden.png'))

        # the permitted page still works for the limited user
        limited_page.goto(f'{args.base}/?api={args.api}#/orders', wait_until='domcontentloaded')
        limited_page.wait_for_timeout(1500)
        report['security'].append({'limited_user_orders_page_ok': limited_page.locator('.card').count() > 0})

        # ---------------- 5) session expiry behaviour ----------------
        limited_page.evaluate('() => { window.localStorage.removeItem("alwled.session"); }')
        limited_page.goto(f'{args.base}/?api={args.api}#/orders', wait_until='domcontentloaded')
        limited_page.wait_for_timeout(1200)
        login_after_clear = limited_page.locator('.auth-card').count() == 1
        report['security'].append({'session_cleared_redirects_to_login': login_after_clear})

        report['console_errors'] = console_errors
        browser.close()

    save()
    # ---- cleanup -------------------------------------------------------------
    api('DELETE', f'/employees/{employee_id}', token=owner_token, base=args.api)
    api('DELETE', f'/roles/{role_id}', token=owner_token, base=args.api)
    report['security'].append({'cleanup': 'employee+role deleted'})

    save()
    print(json.dumps(report, ensure_ascii=False, indent=1)[:200])
    print('report:', OUT / 'report.json')
    return 0 if not report['console_errors'] else 2


if __name__ == '__main__':
    sys.exit(main())
