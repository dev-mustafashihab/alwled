import os
from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/foundation/'
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w, theme in [(390, 'light'), (390, 'dark'), (1366, 'light'), (1366, 'dark')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','%s')}catch(e){}" % theme)
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2800)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(2400)
        # الهيدر وحده
        el = p.query_selector('.shop-header')
        el.screenshot(path=OUT + 'p2-header-%d-%s.png' % (w, theme))
        ctx.close()
    # الدُرج + البحث (جوال)
    for name, act in [('drawer', 'burger'), ('search', 'search')]:
        ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2800)
        if act == 'burger':
            p.click('#shop-burger'); p.wait_for_timeout(900)
        else:
            p.click('#shop-search-btn'); p.wait_for_timeout(700)
            p.fill('#shop-search-sheet-input', 'ثلاجة'); p.wait_for_timeout(1900)
        p.screenshot(path=OUT + 'p2-%s-390.png' % name)
        ctx.close()
    # بحث ديسكتوب + البحث الفارغ
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2800)
    p.evaluate("document.getElementById('shop-search-sheet').hidden = false; document.getElementById('shop-search-sheet').setAttribute('aria-hidden','false'); document.getElementById('shop-search-sheet').classList.add('is-open');")
    p.fill('#shop-search-sheet-input', 'ثلاجة'); p.wait_for_timeout(1900)
    p.screenshot(path=OUT + 'p2-search-1366.png')
    p.fill('#shop-search-sheet-input', 'ززززز'); p.wait_for_timeout(2000)
    p.screenshot(path=OUT + 'p2-search-empty-1366.png')
    ctx.close()
    b.close()
print('ok')
