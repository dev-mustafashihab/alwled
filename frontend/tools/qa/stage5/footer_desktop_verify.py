# تحقق نهائي: فتح/إغلاق الأكورديون على الديسكتوب + أرقام كاملة
from playwright.sync_api import sync_playwright
import json

BASE = "http://127.0.0.1:5173/shop/"

with sync_playwright() as p:
    b = p.chromium.launch()
    out = {}
    for w, name in [(360, '360'), (390, '390'), (430, '430'), (768, '768'), (1366, '1366')]:
        pg = b.new_page(viewport={'width': w, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE, wait_until='networkidle')
        pg.wait_for_timeout(1200)
        pg.evaluate("document.querySelector('.shop-footer')?.scrollIntoView()")
        pg.wait_for_timeout(400)
        h_closed = pg.evaluate("Math.round(document.querySelector('.shop-footer').getBoundingClientRect().height)")
        open_attr = pg.evaluate("[...document.querySelectorAll('.shop-footer__sec')].map(d => d.hasAttribute('open'))")
        # فتح الأكورديون بالنقر
        pg.evaluate("document.querySelector('.shop-footer__sec summary')?.click()")
        pg.wait_for_timeout(300)
        h_open = pg.evaluate("Math.round(document.querySelector('.shop-footer').getBoundingClientRect().height)")
        list_items = pg.evaluate("[...document.querySelectorAll('.shop-footer__sec[open] .shop-footer__list li')].map(li => li.textContent.trim().slice(0,25))")
        # إغلاق مجددًا
        pg.evaluate("document.querySelector('.shop-footer__sec[open] summary')?.click()")
        pg.wait_for_timeout(300)
        h_reclosed = pg.evaluate("Math.round(document.querySelector('.shop-footer').getBoundingClientRect().height)")
        overflow = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        out[name] = {'closed': h_closed, 'open': h_open, 'reclosed': h_reclosed,
                     'openAttrs': open_attr, 'items': list_items, 'overflowX': overflow,
                     'errors': len(errors)}
        pg.screenshot(path=f'/root/alwled/frontend/tools/qa/stage5/final-{name}-footer.png')
        pg.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
