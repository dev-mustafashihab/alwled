from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage5/'
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w, dark, h in [('final-products-1366', 1366, False, '#/products'), ('final-products-1366-dark', 1366, True, '#/products'),
                             ('final-pdp-390', 390, False, '#/products/632'), ('final-home-1366', 1366, False, '#/'),
                             ('final-cart-1366', 1366, False, '#/cart')]:
        ctx = b.new_context(viewport={'width': w, 'height': 1000}, locale='ar')
        if dark:
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2400)
        p.evaluate('location.hash = "%s"' % h); p.wait_for_timeout(2600)
        p.screenshot(path=OUT + name + '.png', full_page=False)
        ctx.close()
    b.close()
print('ok')
