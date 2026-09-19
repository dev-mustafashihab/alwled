import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage6/'
os.makedirs(OUT, exist_ok=True)
R = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 950}, locale='ar')
        p = ctx.new_page()
        cons = []
        p.on('console', lambda m: cons.append(m.type + ':' + m.text[:80]) if m.type in ('error', 'warning') else None)
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(3000)
        p.evaluate('location.hash = "#/"'); p.wait_for_timeout(2800)
        R['home_%d' % w] = p.evaluate("""(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          docH: Math.round(document.documentElement.scrollHeight),
          ticker: (() => { const t = document.getElementById('shop-home-ticker'); const b = t.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(),
          card: (() => { const c = document.querySelector('.shop-home .shop-card'); const b = c.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(),
          hdr: (() => { const c = document.querySelector('.shop-header__inner'); const b = c.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })() }))()""")
        el = p.query_selector('#shop-home-ticker')
        el.scroll_into_view_if_needed(); p.wait_for_timeout(800)
        el.screenshot(path=OUT + 'fixed-ticker-%d.png' % w)
        p.evaluate("document.documentElement.style.fontSize='200%'"); p.wait_for_timeout(900)
        el = p.query_selector('#shop-home-ticker')
        el.scroll_into_view_if_needed(); p.wait_for_timeout(500)
        el.screenshot(path=OUT + 'fixed-ticker-%d-zoom200.png' % w)
        R['home_%d_zoom' % w] = p.evaluate("(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth, docH: Math.round(document.documentElement.scrollHeight) }))()")
        R['console_%d' % w] = cons
        ctx.close()
    b.close()
json.dump(R, open(OUT + 'final-ticker.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False))
