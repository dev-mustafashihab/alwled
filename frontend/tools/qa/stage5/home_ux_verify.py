# تحقق شامل: التبديل مفرد/ثنائي + الحفظ + زر النهاية + العدّاد
from playwright.sync_api import sync_playwright
import json
out = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:80]))
    pg.goto("https://panel.fahd-car.cloud/alwled/shop/", wait_until='networkidle')
    pg.wait_for_timeout(2500)

    # أ) الأزرار موجودة في القسمين
    out['toggles'] = pg.evaluate("""(() => ({
      offers: !!document.querySelector('#shop-home-offers .shop-viewtoggle'),
      featured: !!document.querySelector('#shop-home-featured .shop-viewtoggle'),
      endCtas: [...document.querySelectorAll('.shop-section__endcta')].map(e => e.textContent.trim().replace(/\\s+/g,' '))
    }))()""")

    # ب) الافتراضي ثنائي (عمودان)
    out['defaultCols'] = pg.evaluate("""(() => {
      const g = document.querySelector('#shop-home-offers .shop-grid');
      return getComputedStyle(g).gridTemplateColumns.split(' ').length;
    })()""")

    # ج) اضغط «مفرد» ⇒ عمود واحد + صورة أطول
    pg.evaluate("document.querySelector('#shop-home-offers .shop-viewtoggle__btn[data-view=single]')?.click()")
    pg.wait_for_timeout(400)
    out['single'] = pg.evaluate("""(() => {
      const g = document.querySelector('#shop-home-offers .shop-grid');
      const m = g.querySelector('.shop-card__media');
      return {cols: getComputedStyle(g).gridTemplateColumns.split(' ').length,
              mediaH: Math.round(m.getBoundingClientRect().height),
              pressed: document.querySelector('#shop-home-offers .shop-viewtoggle__btn[data-view=single]').getAttribute('aria-pressed'),
              saved: localStorage.getItem('alw-shop-home-view')};
    })()""")
    pg.evaluate("document.querySelector('#shop-home-offers')?.scrollIntoView()")
    pg.wait_for_timeout(400)
    pg.screenshot(path='/root/alwled/frontend/tools/qa/stage5/home-single-390.png')

    # د) القسم الثاني تبنّى نفس التفضيل (apply عند البناء يقرأ localStorage)
    out['featuredFollows'] = pg.evaluate("""(() => {
      const g = document.querySelector('#shop-home-featured .shop-grid');
      return {cols: getComputedStyle(g).gridTemplateColumns.split(' ').length,
              pressed: document.querySelector('#shop-home-featured .shop-viewtoggle__btn[data-view=single]')?.getAttribute('aria-pressed')};
    })()""")

    # هـ) رجوع للثنائي
    pg.evaluate("document.querySelector('#shop-home-offers .shop-viewtoggle__btn[data-view=double]')?.click()")
    pg.wait_for_timeout(400)
    out['backToDouble'] = pg.evaluate("""(() => ({
      cols: getComputedStyle(document.querySelector('#shop-home-offers .shop-grid')).gridTemplateColumns.split(' ').length,
      saved: localStorage.getItem('alw-shop-home-view')
    }))()""")

    # و) زر النهاية: مقاس وهدف لمس
    out['endcta'] = pg.evaluate("""(() => {
      const e = document.querySelector('#shop-home-offers .shop-section__endcta');
      const r = e.getBoundingClientRect();
      return {w: Math.round(r.width), h: Math.round(r.height)};
    })()""")
    out['errors'] = len(errs)
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
