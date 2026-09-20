# فحص الأخطاء الخمسة + فتح الأكورديون المرئي («الدفع والتوصيل») فعليًا
from playwright.sync_api import sync_playwright
import json

BASE = "http://127.0.0.1:5173/shop/"

with sync_playwright() as p:
    b = p.chromium.launch()
    out = {}
    for w, name in [(390, '390'), (1366, '1366')]:
        pg = b.new_page(viewport={'width': w, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR: ' + str(e)[:120]))
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:120]) if m.type == 'error' else None)
        pg.on('requestfailed', lambda r: errs.append('REQFAIL: ' + r.url[:100]))
        pg.goto(BASE, wait_until='networkidle')
        pg.wait_for_timeout(1500)
        pg.evaluate("document.querySelector('.shop-footer')?.scrollIntoView()")
        pg.wait_for_timeout(600)
        # القسم المرئي (display!=none) — «الدفع والتوصيل»
        vis = pg.evaluate("""(() => {
          const secs = [...document.querySelectorAll('.shop-footer__sec')];
          return secs.map((s, i) => ({i, visible: getComputedStyle(s).display !== 'none',
            text: s.querySelector('summary')?.textContent.trim()}));
        })()""")
        h0 = pg.evaluate("Math.round(document.querySelector('.shop-footer').getBoundingClientRect().height)")
        pg.evaluate("""(() => {
          const s = [...document.querySelectorAll('.shop-footer__sec')]
            .find(s => getComputedStyle(s).display !== 'none');
          s?.querySelector('summary')?.click();
        })()""")
        pg.wait_for_timeout(400)
        opened = pg.evaluate("""(() => {
          const s = [...document.querySelectorAll('.shop-footer__sec')].find(d => d.hasAttribute('open'));
          const items = s ? [...s.querySelectorAll('.shop-footer__list li')].map(li => li.textContent.trim().slice(0, 30)) : [];
          return {open: !!s, items, h: Math.round(document.querySelector('.shop-footer').getBoundingClientRect().height)};
        })()""")
        pg.screenshot(path=f'/root/alwled/frontend/tools/qa/stage5/acc-open-{name}.png')
        pg.evaluate("""(() => {
          const s = [...document.querySelectorAll('.shop-footer__sec')].find(d => d.hasAttribute('open'));
          s?.querySelector('summary')?.click();
        })()""")
        pg.wait_for_timeout(300)
        h2 = pg.evaluate("Math.round(document.querySelector('.shop-footer').getBoundingClientRect().height)")
        out[name] = {'sections': vis, 'closed': h0, 'openResult': opened, 'reclosed': h2, 'errors': errs}
        pg.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
