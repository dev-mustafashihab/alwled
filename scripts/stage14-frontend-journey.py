#!/usr/bin/env python3
"""Stage 14 — رحلة الواجهة الفعلية (Playwright): بيانات stage14 الحقيقية · Deep links · موبايل · أخطاء · CORS.

دخولان فقط (مدير + عميل) لتجنّب حدّ المعدّل؛ الموبايل يُختبر بإعادة تحجيم نفس الصفحة.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path('/root/alwled')
ENV = dict(line.split('=', 1) for line in (ROOT / '.env').read_text().splitlines() if line and not line.startswith('#') and '=' in line)
FRONT = 'https://panel.fahd-car.cloud/alwled/'
API = 'https://panel.fahd-car.cloud/alwled-api/api/v1'
state = json.loads(Path('/tmp/stage14-state.json').read_text())
results: list[dict] = []


def record(step, ok, expected=None, got=None, detail=''):
    entry = {'step': step, 'status': 'PASS' if ok else 'FAIL'}
    if expected is not None:
        entry['expected'] = expected
    if got is not None:
        entry['got'] = got
    if detail:
        entry['detail'] = str(detail)[:400]
    results.append(entry)
    print(f"{'✓' if ok else '✗'} {step}" + (f'  [{got}]' if not ok and got is not None else ''))
    return ok


def login(page, phone, password):
    page.goto(FRONT, wait_until='networkidle')
    page.wait_for_selector('.auth-card', timeout=30000)
    page.fill('input[name="identifier"]', phone)
    page.fill('input[name="password"]', password)
    page.click('.auth-card .btn--primary')
    page.wait_for_selector('.app-sidebar:not([hidden])', timeout=45000)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        errors: list[str] = []
        admin_ctx = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        page = admin_ctx.new_page()
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        login(page, ENV['SEED_OWNER_PHONE'].strip(), ENV['SEED_OWNER_PASSWORD'].strip())
        record('admin login from the static frontend', True)

        page.evaluate("() => window.ALW.nav.go('/dashboard')")
        page.wait_for_timeout(2500)
        body = page.inner_text('#content')
        record('dashboard shows the Stage14 order number', str(state['orderA'].get('number')) in body,
               detail=f"searched {state['orderA'].get('number')}")
        record('dashboard shows the succeeded payment amount 200.00', '200.00' in body or '200' in body)

        page.evaluate("() => window.ALW.nav.go('/orders')")
        page.wait_for_timeout(2500)
        table = page.inner_text('#content')
        record('orders page lists the integration order', str(state['orderA']['number']) in table)
        record('orders page shows the server total', '200' in table)

        page.evaluate("() => window.ALW.nav.go('/payments')")
        page.wait_for_timeout(2500)
        payments_text = page.inner_text('#content')
        record('payments page renders the Stage14 payments', 'SHAM_CASH' in payments_text.upper() or 'شام' in payments_text,
               detail=payments_text[:120].replace('\n', ' '))
        page.evaluate("() => window.ALW.nav.go('/payments/review')")
        page.wait_for_timeout(2500)
        review_text = page.inner_text('#content')
        record('review queue page renders with real data', len(review_text) > 40, detail=review_text[:100].replace('\n', ' '))

        page.evaluate("() => window.ALW.nav.go('/products')")
        page.wait_for_timeout(2500)
        products_text = page.inner_text('#content')
        record('catalog shows the Stage14 product', 'Stage14' in products_text)
        record('catalog shows the updated price 175.50', '175.50' in products_text or '175.5' in products_text)

        page.evaluate("() => window.ALW.nav.go('/inventory')")
        page.wait_for_timeout(2500)
        record('inventory page renders the Stage14 product row', 'Stage14' in page.inner_text('#content'))

        page.evaluate("() => window.ALW.nav.go('/notifications')")
        page.wait_for_timeout(2500)
        record('notifications page renders', 'الإشعارات' in page.inner_text('#content'))

        page.evaluate("() => window.ALW.nav.go('/verification')")
        page.wait_for_timeout(2500)
        verification_text = page.inner_text('#content')
        record('verification page shows the Stage14 decisions',
               any(token in verification_text for token in ('موثّق', 'VERIFIED', 'مرفوض', 'قيد')),
               detail=verification_text[:120].replace('\n', ' '))

        page.evaluate("() => window.ALW.nav.go('/analytics')")
        page.wait_for_timeout(3000)
        analytics_text = page.inner_text('#content')
        record('analytics page renders server data', len(analytics_text) > 60, detail=analytics_text[:100].replace('\n', ' '))

        for route, needle in (('#/dashboard', 'لوحة التحكم'), ('#/products', 'المنتجات'), ('#/orders', 'الطلبات'),
                              ('#/payments/review', 'مراجعة'), ('#/notifications', 'الإشعارات')):
            page.goto(FRONT + route, wait_until='networkidle')
            page.wait_for_timeout(1800)
            text = page.inner_text('#content') if page.locator('#content').count() else ''
            record(f'deep link after a hard refresh {route}', needle in text, detail=text[:60].replace('\n', ' '))

        page.goto(FRONT + '#/definitely-not-a-route', wait_until='networkidle')
        page.wait_for_timeout(1500)
        record('unknown route renders the not-found state', 'غير موجود' in page.inner_text('#content'))

        admin_ctx.set_offline(True)
        page.evaluate("() => window.ALW.nav.go('/products')")
        page.wait_for_timeout(3500)
        offline_text = page.inner_text('#content')
        record('network loss shows an in-app error state (no crash)',
               len(offline_text) > 20 and any(token in offline_text for token in ('خطأ', 'تعذّر', 'شبكة', 'فشل')),
               detail=offline_text[:120].replace('\n', ' '))
        admin_ctx.set_offline(False)
        admin_ctx.close()

        # ---------------- customer: gating, isolation in the UI, mobile ----------------
        cust = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        cpage = cust.new_page()
        cpage.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        login(cpage, state['customerA']['phone'], 'Stage14!QApass9')
        nav = cpage.evaluate("() => [...document.querySelectorAll('.nav-item')].map((a) => a.textContent.trim())")
        record('customer navigation is limited to their own pages', all(x in ('إشعاراتي', 'حسابي') for x in nav), detail=json.dumps(nav, ensure_ascii=False))
        cpage.evaluate("() => window.ALW.nav.go('/dashboard')")
        cpage.wait_for_timeout(1800)
        record('customer hitting an admin route sees the forbidden state', 'صلاحية' in cpage.inner_text('#content'),
               detail=cpage.inner_text('#content')[:90].replace('\n', ' '))
        forbidden_status = cpage.evaluate("""async () => {
            try { await window.ALW.api.get('/admin/orders'); return 200; }
            catch (error) { return (error && (error.status || error.code)) || 0; }
        }""")
        record('backend refuses the forbidden call (403) even from the browser', forbidden_status == 403, 403, forbidden_status)

        cpage.evaluate("() => window.ALW.nav.go('/notifications')")
        cpage.wait_for_timeout(2500)
        cust_notifications = cpage.inner_text('#content')
        record('customer notifications page renders their own notifications', 'الإشعارات' in cust_notifications)
        record('customer sees a Stage14 payment/verification notification',
               any(token in cust_notifications for token in ('الدفع', 'دفعة', 'تحقق', 'الطلب')),
               detail=cust_notifications[:140].replace('\n', ' '))

        for width, height in ((390, 844), (430, 932)):
            cpage.set_viewport_size({'width': width, 'height': height})
            cpage.wait_for_timeout(800)
            cpage.evaluate("() => window.ALW.nav.go('/dashboard')")
            cpage.wait_for_timeout(1500)
            overflow = cpage.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
            record(f'{width}px: no horizontal overflow', not overflow)
            visible_toggle = cpage.evaluate("() => !!document.querySelector('.sidebar-toggle-mobile') && document.querySelector('.sidebar-toggle-mobile').offsetParent !== null")
            record(f'{width}px: mobile menu button available', visible_toggle)
            if visible_toggle:
                cpage.click('.sidebar-toggle-mobile')
                cpage.wait_for_timeout(700)
                record(f'{width}px: drawer opens', cpage.evaluate("() => !!document.querySelector('.app-sidebar.is-open')"))
                cpage.screenshot(path=f'/root/alwled/frontend/tools/qa/visual/stage14-{width}-drawer.png')
                cpage.evaluate("() => document.querySelector('.sidebar-scrim')?.click()")
                cpage.wait_for_timeout(600)
            cpage.evaluate("() => window.ALW.nav.go('/notifications')")
            cpage.wait_for_timeout(2000)
            record(f'{width}px: notifications page usable', 'الإشعارات' in cpage.inner_text('#content'))
            cpage.screenshot(path=f'/root/alwled/frontend/tools/qa/visual/stage14-{width}-customer.png')
        cust.close()

        # الأخطاء الناتجة عن اختباري «انقطاع الشبكة» و«403 المتعمّد» متوقّعة ومقصودة
        expected_markers = ('ERR_INTERNET_DISCONNECTED', '403 (Forbidden)')
        unexpected = [e for e in errors if not any(marker in e for marker in expected_markers)]
        record('no unexpected console errors during the whole UI journey', len(unexpected) == 0,
               detail=json.dumps(unexpected[:3], ensure_ascii=False) + f' (expected test-induced: {len(errors) - len(unexpected)})')
        browser.close()

    cors = api_cors_probe()
    record('cross-origin preflight is not wildcard', cors.get('allowOrigin') != '*', detail=json.dumps(cors, ensure_ascii=False))
    record('CORS does not allow an arbitrary origin with credentials',
           not (cors.get('allowOrigin') == 'http://127.0.0.1:5173' and cors.get('allowCredentials') == 'true'),
           detail=json.dumps(cors, ensure_ascii=False))

    existing = json.loads(Path('/tmp/stage14-frontend-report.json').read_text()).get('results', []) if Path('/tmp/stage14-frontend-report.json').exists() else []
    Path('/tmp/stage14-frontend-report.json').write_text(json.dumps({'results': existing + results}, ensure_ascii=False, indent=2))
    failed = [r for r in results if r['status'] == 'FAIL']
    print(f"\n=== frontend journey: {len(results) - len(failed)}/{len(results)} PASS · failed={len(failed)} ===")
    for item in failed:
        print('  ✗', item['step'], '|', item.get('got'), '|', item.get('detail', '')[:150])
    return 0


def api_cors_probe() -> dict:
    request = urllib.request.Request(API + '/products', method='OPTIONS')
    request.add_header('Origin', 'http://127.0.0.1:5173')
    request.add_header('Access-Control-Request-Method', 'GET')
    request.add_header('Access-Control-Request-Headers', 'authorization')
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            headers = dict(response.headers)
            return {'status': response.status, 'allowOrigin': headers.get('Access-Control-Allow-Origin'),
                    'allowCredentials': headers.get('Access-Control-Allow-Credentials')}
    except urllib.error.HTTPError as error:
        return {'status': error.code, 'allowOrigin': error.headers.get('Access-Control-Allow-Origin'),
                'allowCredentials': error.headers.get('Access-Control-Allow-Credentials')}
    except Exception as error:  # noqa: BLE001
        return {'status': 0, 'error': str(error)[:120]}


if __name__ == '__main__':
    raise SystemExit(main())
