import os
from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/foundation/'
H = open(OUT + 'harness.js', encoding='utf-8').read()
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme in ('light', 'dark'):
        ctx = b.new_context(viewport={'width': 520, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','%s')}catch(e){}" % theme)
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2500)
        p.evaluate(H); p.evaluate("window.__stwHarness.mount()"); p.wait_for_timeout(700)
        el = p.query_selector('#stw-foundation-harness')
        el.screenshot(path=OUT + 'foundation-%s.png' % theme)
        ctx.close()
    b.close()
print('ok')