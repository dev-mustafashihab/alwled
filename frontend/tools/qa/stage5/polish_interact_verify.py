# التحقق الوظيفي من طبقة التلميع: hover · focus · selection · reduced-motion
from playwright.sync_api import sync_playwright
import json

BASE = "https://panel.fahd-car.cloud/alwled/shop/"

with sync_playwright() as p:
    b = p.chromium.launch()
    out = {}
    # A) 1366 — hover + focus + selection
    pg = b.new_page(viewport={'width': 1366, 'height': 900})
    pg.goto(BASE, wait_until='networkidle')
    pg.wait_for_timeout(2000)
    card = pg.locator('.shop-card').first
    card.scroll_into_view_if_needed()
    pg.wait_for_timeout(400)
    # ملاحظة: بطاقة بلا صورة → placeholder (svg) — نتحقق من التحويم على الوسيط نفسه
    card = pg.locator('.shop-card').first
    card.scroll_into_view_if_needed()
    pg.wait_for_timeout(400)
    ph_before = card.locator('.shop-card__placeholder').evaluate("e => getComputedStyle(e).transform")
    card.hover()
    pg.wait_for_timeout(500)
    out['hover'] = {
        'mediaTransformBefore': ph_before,
        'mediaTransformAfter': card.locator('.shop-card__placeholder').evaluate("e => getComputedStyle(e).transform"),
        'cardShadowAfter': card.evaluate("e => getComputedStyle(e).boxShadow.slice(0,50)"),
        'nameColorAfter': card.locator('.shop-card__name a').evaluate("e => getComputedStyle(e).color"),
    }
    # focus على حقل بحث
    inp = pg.locator('.shop-body input:visible').first
    inp.focus()
    pg.wait_for_timeout(200)
    out['focus'] = inp.evaluate("e => getComputedStyle(e).boxShadow.slice(0,50)")
    # selection
    out['selection'] = pg.evaluate("""(() => {
      const st = document.createElement('style');
      document.head.appendChild(st);
      const p = document.querySelector('.shop-footer__note');
      const range = document.createRange(); range.selectNodeContents(p);
      return getComputedStyle(p, '::selection').backgroundColor;
    })()""")
    pg.screenshot(path='/root/alwled/frontend/tools/qa/stage5/polish-1366-hover.png')
    pg.close()
    # B) reduced-motion — التلميع يُلغى
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, reduced_motion='reduce')
    pg2 = ctx.new_page()
    pg2.goto(BASE, wait_until='networkidle')
    pg2.wait_for_timeout(2000)
    out['reducedMotion'] = pg2.evaluate("""(() => {
      const img = document.querySelector('.shop-card__media img');
      return {
        hasCard: !!document.querySelector('.shop-card'),
        imgTransition: img ? getComputedStyle(img).transitionDuration : 'no-img',
        scrollBehavior: getComputedStyle(document.body).scrollBehavior
      };
    })()""")
    ctx.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
