"""PHASE 2 · STEP 2D — إثبات إضافي: شاشة قصيرة (390×600) + التمرير داخل القائمة + dark/focus."""
import json
import os
import sys

from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage2d'
res = {}

JS = """(() => {
  const s = document.getElementById('shop-menu-scroll');
  const foot = document.querySelector('.shop-drawer__foot .btn');
  const theme = document.querySelector('.shop-menu__theme');
  const rows = Array.from(document.querySelectorAll('.shop-drawer__link')).filter(l => l.getBoundingClientRect().height > 0);
  const last = rows[rows.length - 1];
  const vh = window.innerHeight;
  const rect = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height)}; };
  return {viewport: {w: window.innerWidth, h: vh},
          scrollTop: s ? Math.round(s.scrollTop) : null,
          maxScroll: s ? Math.round(s.scrollHeight - s.clientHeight) : null,
          lastRow: last ? {text: (last.textContent || '').trim().slice(0, 18), rect: rect(last),
                           fullyVisible: rect(last).bottom <= vh + 0.5 && rect(last).top >= 0} : null,
          theme: rect(theme), themeReachable: theme ? rect(theme).bottom <= vh + 0.5 : null,
          cta: rect(foot), ctaReachable: foot ? rect(foot).bottom <= vh + 0.5 : null,
          pageScrollY: Math.round(window.scrollY)};
})()"""

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for label, auth in [('guest', False), ('auth', True)]:
        ctx = b.new_context(viewport={'width': 390, 'height': 600}, locale='ar', device_scale_factor=2)
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1600)
        if auth:
            page.evaluate("""async () => { const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
              window.ALW.session.start(res); window.ALW.app.refreshShell(); }""")
            page.wait_for_timeout(2200)
        page.click('#shop-burger')
        page.wait_for_timeout(800)
        page.mouse.move(195, 592)
        page.wait_for_timeout(200)
        res[label + '_top'] = page.evaluate(JS)
        page.screenshot(path=os.path.join(OUT, '%s-390x600-%s-top.png' % (TAG, label)))
        page.evaluate("(() => { const s = document.getElementById('shop-menu-scroll'); if (s) s.scrollTop = s.scrollHeight; })()")
        page.wait_for_timeout(500)
        res[label + '_bottom'] = page.evaluate(JS)
        page.screenshot(path=os.path.join(OUT, '%s-390x600-%s-bottom.png' % (TAG, label)))
        ctx.close()
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=2))
with open(os.path.join(OUT, 'short-%s.json' % TAG), 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
