#!/usr/bin/env python3
"""تشخيص سريع: لماذا لا تُقلع اللوحة؟ (يجمع أخطاء console والتشخيص من الصفحة)"""
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173'
api = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:3100/api/v1'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    messages = []
    page.on('console', lambda m: messages.append(f'[{m.type}] {m.text}'))
    page.on('pageerror', lambda e: messages.append(f'[pageerror] {e}'))
    page.on('requestfailed', lambda r: messages.append(f'[requestfailed] {r.url} :: {r.failure}'))
    page.goto(f'{base}/?api={api}', wait_until='networkidle')
    page.wait_for_timeout(2500)
    state = page.evaluate("""() => ({
      hasApp: !!document.getElementById('app'),
      appChildren: document.getElementById('app') ? document.getElementById('app').children.length : 0,
      authCard: document.querySelectorAll('.auth-card').length,
      modules: {
        config: !!window.ALW?.config, api: !!window.ALW?.api, session: !!window.ALW?.session,
        auth: !!window.ALW?.auth, router: !!window.ALW?.router, pages: !!window.ALW?.pages,
        login: !!(window.ALW?.pages?.login), ui: !!window.ALW?.ui, dom: !!window.ALW?.dom,
        resourcePage: !!window.ALW?.resourcePage, pagesOps: !!window.ALW?.pagesOps,
        pagesCatalog: !!window.ALW?.pagesCatalog,
      },
      bodyText: document.body.innerText.slice(0, 200),
    })""")
    print('STATE:', state)
    print('MESSAGES:')
    for m in messages[-25:]:
        print('  ', m[:400])
    browser.close()
