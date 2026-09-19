#!/usr/bin/env python3
"""Stage 14.1 — انحدار لوحة الإدارة: التأكد أن متجر الزوار لم يكسر أي شيء في اللوحة.

يفحص: زائر ⇒ صفحة دخول (لا تغيير) · دخول المدير · Dashboard · Products · Roles · Payments · Notifications
+ لا أخطاء كونسول + عناوين فعلية مع بيانات حقيقية.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

PANEL = 'https://panel.fahd-car.cloud/alwled/admin/'
ENV = dict(line.split('=', 1) for line in Path('/root/alwled/.env').read_text().splitlines() if line and not line.startswith('#') and '=' in line)
results: list[dict] = []


def record(step: str, ok: bool, expected=None, got=None, detail: str = '') -> bool:
    entry = {'step': step, 'status': 'PASS' if ok else 'FAIL'}
    if expected is not None:
        entry['expected'] = expected
    if got is not None:
        entry['got'] = got
    if detail:
        entry['detail'] = str(detail)[:300]
    results.append(entry)
    print(f"{'✓' if ok else '✗'} {step}" + (f'  [{got}]' if not ok and got is not None else ''))
    return ok


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        errors: list[str] = []
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: errors.append('pageerror: ' + str(err)[:180]))

        # visitor → login page (unchanged behaviour)
        page.goto(PANEL, wait_until='networkidle')
        page.wait_for_selector('.auth-card', timeout=30000)
        record('visitor opening the panel still lands on login', True)

        page.fill('input[name="identifier"]', ENV['SEED_OWNER_PHONE'].strip())
        page.fill('input[name="password"]', ENV['SEED_OWNER_PASSWORD'].strip())
        page.click('.auth-card .btn--primary')
        page.wait_for_selector('.app-sidebar:not([hidden])', timeout=45000)
        page.wait_for_timeout(2000)
        base = page.evaluate("() => window.ALW.config.apiBaseUrl")
        record('admin login works and the API base is unchanged', base == '/alwled-api/api/v1', '/alwled-api/api/v1', base)

        checks = [
            ('/dashboard', 'لوحة التحكم', '.kpi, .card'),
            ('/products', 'المنتجات', '.table, .table-wrap'),
            ('/roles', 'الأدوار', '.table, .table-wrap, .card'),
            ('/payments', 'الدفعات', '.table, .table-wrap, .state'),
            ('/notifications', 'الإشعارات', '.card, .state, .table'),
        ]
        for route, needle, selector in checks:
            page.evaluate(f"() => window.ALW.nav.go('{route}')")
            page.wait_for_timeout(2200)
            text = page.inner_text('#content')
            found = needle in text
            has_block = page.locator(selector).count() > 0
            record(f'admin {route} renders real content', found and has_block, detail=text[:60].replace('\n', ' '))

        nav_count = page.evaluate("() => document.querySelectorAll('.nav-item').length")
        record('admin navigation is intact', nav_count >= 15, '>=15', nav_count)
        record('no console errors in the admin journey', not errors, detail=json.dumps(errors[:2], ensure_ascii=False))
        ctx.close()

        # the store must remain a separate surface
        store = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        spage = store.new_page()
        spage.goto(PANEL + 'shop/', wait_until='networkidle')
        spage.wait_for_timeout(1800)
        record('store has no admin navigation', spage.evaluate("() => document.querySelectorAll('.nav-item, .app-sidebar').length === 0"))
        store.close()
        browser.close()

    Path('/root/alwled/frontend/tools/qa/shop/admin-regression.json').write_text(json.dumps({'results': results}, ensure_ascii=False, indent=2))
    failed = [r for r in results if r['status'] == 'FAIL']
    print(f"\n=== admin regression: {len(results) - len(failed)}/{len(results)} PASS ===")
    for item in failed:
        print('  ✗', item['step'], '|', item.get('got'), '|', item.get('detail', '')[:140])
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
