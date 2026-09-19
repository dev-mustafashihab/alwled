import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
R = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load')
        p.wait_for_timeout(2400)
        if w <= 1023:
            p.click('#shop-search-btn'); p.wait_for_timeout(900)
            p.fill('#shop-search-sheet-input', 'ثلاجة'); p.wait_for_timeout(1800)
            R['search_row_%d' % w] = p.evaluate("(()=>{const e=document.querySelector('.shop-search-row'); if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height)];})()")
            R['search_input_%d' % w] = p.evaluate("(()=>{const e=document.querySelector('.shop-search-sheet__input'); const b=e.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height)];})()")
            R['menu_row_%d' % w] = p.evaluate("(()=>{const e=document.querySelector('.shop-drawer__link'); if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height)];})()")
        p.evaluate('location.hash = "#/products?view=categories"'); p.wait_for_timeout(2400)
        R['taxo_%d' % w] = p.evaluate("(()=>{const e=document.querySelector('#shop-view > .shop-taxonomy > .shop-taxonomy__item'); const b=e.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height)];})()")
        p.evaluate('location.hash = "#/"'); p.wait_for_timeout(2400)
        R['home_card_%d' % w] = p.evaluate("(()=>{const e=document.querySelector('.shop-home .shop-card'); const b=e.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height)];})()")
        ctx.close()
    b.close()
print(json.dumps(R, ensure_ascii=False))
