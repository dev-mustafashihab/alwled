# خط أساس شامل: مقاسات + إتاحة + تفاعلات (قبل أي تلميع) — يُكتب JSON للمقارنة
from playwright.sync_api import sync_playwright
import json

BASE = "https://panel.fahd-car.cloud/alwled/shop/"

MEASURE_JS = """(() => {
  const out = {};
  // 1) أطوال المقاطع الرئيسية (home)
  const h = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height) : -1; };
  out.header = h('.shop-header');
  out.footer = h('.shop-footer');
  out.view = h('#shop-view');
  out.doc = Math.round(document.documentElement.scrollHeight);
  out.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  // 2) تفاعلات: hover لكرت منتج
  const card = document.querySelector('.shop-card');
  if (card) {
    const before = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    out.cardShadow = cs.boxShadow.slice(0, 40);
    out.cardTransform = cs.transform;
    card.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
  }
  // 3) عناصر قابلة للتحديد
  const sel = getComputedStyle(document.body).userSelect;
  out.bodyUserSelect = sel;
  // 4) أسماء الصور البديلة المفقودة
  out.imgsNoAlt = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length;
  // 5) عدّاد الانتقالات المعرفة
  out.transitions = [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).transitionDuration !== '0s').length;
  return out;
})()"""

with sync_playwright() as p:
    b = p.chromium.launch()
    res = {}
    for w, name in [(360, '360'), (390, '390'), (768, '768'), (1366, '1366')]:
        pg = b.new_page(viewport={'width': w, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:80]))
        pg.goto(BASE, wait_until='networkidle')
        pg.wait_for_timeout(2000)
        res[name] = pg.evaluate(MEASURE_JS)
        res[name]['jsErrors'] = len(errs)
        res[name]['overflowPages'] = {}
        # مسارات إضافية: overflow
        for route, rname in [('#/products', 'products'), ('#/cart', 'cart'), ('#/login', 'login')]:
            pg.goto(BASE + route, wait_until='networkidle')
            pg.wait_for_timeout(1200)
            res[name]['overflowPages'][rname] = pg.evaluate(
                "document.documentElement.scrollWidth - document.documentElement.clientWidth")
            res[name]['h_' + rname] = pg.evaluate("Math.round(document.querySelector('#shop-view')?.getBoundingClientRect().height || -1)")
        pg.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
with open('/root/alwled/frontend/tools/qa/stage5/polish-baseline.json', 'w') as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
