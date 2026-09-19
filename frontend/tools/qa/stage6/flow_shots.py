import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage6/'
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(3000)
    p.evaluate('location.hash = "#/"'); p.wait_for_timeout(2600)
    el = p.query_selector('#shop-home-ticker')
    el.scroll_into_view_if_needed(); p.wait_for_timeout(500)
    for i, wait in enumerate([0, 3500, 3500, 3500]):
        if wait:
            p.wait_for_timeout(wait)
        el.screenshot(path=OUT + 'flow-%d.png' % i)
        tf = p.evaluate("getComputedStyle(document.querySelector('.shop-home-ticker__track')).transform")
        print(i, tf)
    ctx.close(); b.close()
print('shots ok')
