# القياس النهائي عبر الإنتاج (HTTPS) — فوتر 5 مقاسات + أكورديون مفتوح/مغلق + أخطاء حقيقية
from playwright.sync_api import sync_playwright
import json

BASE = "https://panel.fahd-car.cloud/alwled/shop/"

with sync_playwright() as p:
    b = p.chromium.launch(args=['--ignore-certificate-errors'])
    out = {}
    for w, name in [(360, '360'), (390, '390'), (430, '430'), (768, '768'), (1366, '1366')]:
        pg = b.new_page(viewport={'width': w, 'height': 900})
        errs, bad = [], []
        pg.on('pageerror', lambda e: errs.append(str(e)[:100]))
        pg.on('console', lambda m: errs.append(m.text[:100]) if m.type == 'error' else None)
        pg.on('response', lambda r: bad.append((r.status, r.url[-60:])) if r.status >= 400 else None)
        pg.goto(BASE, wait_until='networkidle')
        pg.wait_for_timeout(1500)
        pg.evaluate("document.querySelector('.shop-footer')?.scrollIntoView()")
        pg.wait_for_timeout(500)
        h0 = pg.evaluate("Math.round(document.querySelector('.shop-footer').getBoundingClientRect().height)")
        notes = pg.evaluate("[...document.querySelectorAll('.shop-footer__note, .shop-footer__note-inline')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent.trim().slice(0, 50))")
        # فتح «الدفع والتوصيل»
        pg.evaluate("""(() => { [...document.querySelectorAll('.shop-footer__sec')]
          .find(s => getComputedStyle(s).display !== 'none')?.querySelector('summary')?.click(); })()""")
        pg.wait_for_timeout(400)
        opened = pg.evaluate("""(() => {
          const s = [...document.querySelectorAll('.shop-footer__sec')].find(d => d.hasAttribute('open'));
          return {open: !!s, nItems: s ? s.querySelectorAll('.shop-footer__list li').length : 0,
                  h: Math.round(document.querySelector('.shop-footer').getBoundingClientRect().height)};
        })()""")
        pg.evaluate("""(() => { [...document.querySelectorAll('.shop-footer__sec')]
          .find(d => d.hasAttribute('open'))?.querySelector('summary')?.click(); })()""")
        pg.wait_for_timeout(300)
        h2 = pg.evaluate("Math.round(document.querySelector('.shop-footer').getBoundingClientRect().height)")
        overflow = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        out[name] = {'closed': h0, 'open': opened, 'reclosed': h2, 'notes': notes,
                     'overflowX': overflow, 'jsErrors': len(errs), 'badResponses': bad}
        pg.screenshot(path=f'/root/alwled/frontend/tools/qa/stage5/prod-{name}-footer.png')
        pg.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
