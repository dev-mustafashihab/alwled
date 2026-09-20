# تحقق فوتر الشعار 3D: محتوى صحيح · الحركة تعمل · reduced-motion ثابت · لا أخطاء
from playwright.sync_api import sync_playwright
import json

BASE = "https://panel.fahd-car.cloud/alwled/shop/"

with sync_playwright() as p:
    b = p.chromium.launch()
    out = {}
    for w, name in [(360, '360'), (390, '390'), (768, '768'), (1366, '1366')]:
        pg = b.new_page(viewport={'width': w, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:80]))
        pg.goto(BASE, wait_until='networkidle')
        pg.wait_for_timeout(2000)
        pg.evaluate("document.querySelector('.shop-footer')?.scrollIntoView()")
        pg.wait_for_timeout(600)
        info = pg.evaluate("""(() => {
          const f = document.querySelector('.shop-footer');
          const logo = f.querySelector('.shop-footer__logo3d');
          const anim = logo ? getComputedStyle(logo).animationName : 'none';
          const tr1 = logo ? getComputedStyle(logo).transform : '';
          return {
            h: Math.round(f.getBoundingClientRect().height),
            texts: [...f.querySelectorAll('.shop-footer__name, .shop-footer__year')].map(e => e.textContent.trim()),
            oldSections: f.querySelectorAll('.shop-footer__sec').length,
            logoLoaded: logo ? logo.naturalWidth > 0 : false,
            anim,
            transformNow: tr1.slice(0, 40),
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
          };
        })()""")
        out[name] = info
        # لقطتان بفارق زمني لإثبات الحركة
        pg.screenshot(path=f'/root/alwled/frontend/tools/qa/stage5/mark3d-{name}-t1.png')
        pg.wait_for_timeout(1500)
        out[name]['transformLater'] = pg.evaluate(
            "getComputedStyle(document.querySelector('.shop-footer__logo3d')).transform.slice(0, 40)")
        pg.screenshot(path=f'/root/alwled/frontend/tools/qa/stage5/mark3d-{name}-t2.png')
        out[name]['errors'] = len(errs)
        pg.close()
    # reduced-motion
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, reduced_motion='reduce')
    pg2 = ctx.new_page()
    pg2.goto(BASE, wait_until='networkidle')
    pg2.wait_for_timeout(1500)
    out['reduced'] = pg2.evaluate("""(() => {
      const logo = document.querySelector('.shop-footer__logo3d');
      return {anim: getComputedStyle(logo).animationName,
              transform: getComputedStyle(logo).transform.slice(0, 30)};
    })()""")
    ctx.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
