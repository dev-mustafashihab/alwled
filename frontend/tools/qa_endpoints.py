#!/usr/bin/env python3
"""Stage 13 — جرد الـAPI الفعلي: يرصد كل نداء يقوم به الـFrontend أثناء المرور على كل الصفحات."""
from __future__ import annotations

import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ENV = dict(re.findall(r'^(\w+)=(.*)$', Path('/root/alwled/.env').read_text(), re.M))
URL = 'https://panel.fahd-car.cloud/alwled/admin/'
ROUTES = ['dashboard', 'analytics', 'products', 'categories', 'brands', 'specifications', 'inventory',
          'orders', 'payments', 'payments/review', 'customers', 'verification', 'notifications',
          'admin/notifications', 'employees', 'roles', 'audit', 'account']


def main() -> int:
    hits: set[tuple[str, str]] = set()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        context = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        # اربط العميل المركزي لتسجيل كل نداء (بدون أي تعديل على كود الواجهة)
        context.add_init_script("""
          window.__calls = [];
          const originalFetch = window.fetch;
          window.fetch = function (input, init) {
            try {
              const url = typeof input === 'string' ? input : (input && input.url) || '';
              if (url.indexOf('/api/v1') !== -1) {
                window.__calls.push(((init && init.method) || 'GET') + ' ' + url.split('/api/v1')[1].split('?')[0]);
              }
            } catch (error) {}
            return originalFetch.apply(this, arguments);
          };
        """)
        page = context.new_page()
        page.goto(URL, wait_until='networkidle')
        page.wait_for_selector('.auth-card', timeout=30000)
        page.fill('input[name="identifier"]', ENV['SEED_OWNER_PHONE'].strip())
        page.fill('input[name="password"]', ENV['SEED_OWNER_PASSWORD'].strip())
        page.click('.auth-card .btn--primary')
        page.wait_for_selector('.app-sidebar:not([hidden])', timeout=30000)
        page.wait_for_timeout(2500)

        for route in ROUTES:
            page.evaluate(f"() => window.ALW.nav.go('/{route}')")
            page.wait_for_timeout(1500)

        # واجهات إضافية: صورة المنتج + سجل الحركات + تفاصيل الطلب/الدفعة + قائمة الجرس + الوضع الداكن
        page.evaluate("() => window.ALW.nav.go('/inventory')")
        page.wait_for_timeout(1800)
        buttons = page.locator('#content .table__cell-actions button')
        if buttons.count() > 1:
            buttons.nth(1).click()   # سجل الحركات
            page.wait_for_timeout(1500)
            page.keyboard.press('Escape')
        page.evaluate("() => window.ALW.nav.go('/products')")
        page.wait_for_timeout(1800)
        page.locator('#content .table tbody tr').first.click()
        page.wait_for_timeout(1500)
        page.keyboard.press('Escape')
        page.click('.bell .icon-btn')
        page.wait_for_timeout(1200)
        page.keyboard.press('Escape')

        raw = page.evaluate('() => window.__calls || []')
        for entry in raw:
            method, _, path = entry.partition(' ')
            normalized = re.sub(r'/[A-Za-z0-9_-]{20,}(?=/|$)', '/{id}', path)
            normalized = re.sub(r'/\d+(?=/|$)', '/{id}', normalized)
            hits.add((method.upper(), normalized))
        browser.close()

    print(json.dumps(sorted(f'{m} /api/v1{p}' for m, p in hits), ensure_ascii=False, indent=0))
    print('distinct endpoints used by the panel:', len(hits))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
