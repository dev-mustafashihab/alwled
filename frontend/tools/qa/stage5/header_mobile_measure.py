# هيدر الجوال: أبعاد الأزرار · ترتيبها · حالة البرغر مفتوح
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    b = p.chromium.launch()
    out = {}
    for w in (360, 390):
        pg = b.new_page(viewport={'width': w, 'height': 900})
        pg.goto("https://panel.fahd-car.cloud/alwled/shop/", wait_until='networkidle')
        pg.wait_for_timeout(1500)
        r = pg.evaluate("""(() => {
          const q = (sel) => {
            const e = document.querySelector(sel);
            if (!e || getComputedStyle(e).display === 'none') return null;
            const r = e.getBoundingClientRect();
            return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
          };
          return {
            burger: q('#shop-burger'), search: q('#shop-search-btn'),
            actions: q('#shop-actions'), cart: q('.shop-cartbtn'),
            brand: q('.shop-brand'),
            innerGap: getComputedStyle(document.querySelector('.shop-header__inner')).columnGap,
            actionsGap: getComputedStyle(document.getElementById('shop-actions')).columnGap
          };
        })()""")
        out[w] = r
        # فتح الدُرج لفحص حالة البرغر
        pg.evaluate("document.getElementById('shop-burger')?.click()")
        pg.wait_for_timeout(600)
        out[w]['openState'] = pg.evaluate("""(() => {
          const b = document.getElementById('shop-burger');
          const spans = [...b.querySelectorAll('.shop-burger span')].map(s => {
            const c = getComputedStyle(s);
            return {top: c.top, transform: c.transform.slice(0, 30), opacity: c.opacity};
          });
          return {expanded: b.getAttribute('aria-expanded'), spans};
        })()""")
        pg.screenshot(path=f'/root/alwled/frontend/tools/qa/stage5/hdr-mob-{w}-open.png')
        pg.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
