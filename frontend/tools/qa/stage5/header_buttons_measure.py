# حالة أزرار الهيدر (زائر): أبعاد ومحاذاة زوج «تسجيل الدخول/إنشاء حساب»
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    b = p.chromium.launch()
    out = {}
    for w in (1024, 1366):
        pg = b.new_page(viewport={'width': w, 'height': 900})
        pg.goto("https://panel.fahd-car.cloud/alwled/shop/", wait_until='networkidle')
        pg.wait_for_timeout(1500)
        r = pg.evaluate("""(() => {
          const acts = document.getElementById('shop-actions');
          const btns = [...acts.querySelectorAll('a')].filter(a => getComputedStyle(a).display !== 'none');
          const cs = getComputedStyle(acts);
          return {
            actionsDisplay: cs.display,
            actionsAlign: cs.alignItems,
            gap: cs.columnGap,
            btns: btns.map(a => {
              const r = a.getBoundingClientRect();
              const c = getComputedStyle(a);
              return {text: a.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y),
                      w: Math.round(r.width), h: Math.round(r.height),
                      fs: c.fontSize, minH: c.minHeight, pad: c.padding};
            })
          };
        })()""")
        out[w] = r
        pg.screenshot(path=f'/root/alwled/frontend/tools/qa/stage5/hdr-btns-{w}.png')
        pg.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
