"""PHASE 2 · STEP 2C — فحص الثيم الداكن لهيدر الجوال (انحدار فقط، بلا تغيير نطاق).
يقارن ألوان الهيدر/الأزرار في الثيم الداكن على 390px قبل/بعد.
"""
import json
import sys

from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else 'after'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
JS = """(() => {
  const cs = el => el ? getComputedStyle(el) : null;
  const h = document.querySelector('.shop-header');
  const s = document.getElementById('shop-search-btn');
  const c = document.getElementById('shop-cart-button');
  const b = document.getElementById('shop-burger');
  const g = el => { const x = cs(el); return x ? [x.backgroundColor, x.color, x.borderTopColor] : null; };
  return {theme: document.documentElement.getAttribute('data-theme'),
          header: [cs(h).backgroundColor, cs(h).borderBottomColor, cs(h).boxShadow],
          search: g(s), cart: g(c), burger: g(b),
          storeSurface: getComputedStyle(document.body).getPropertyValue('--store-surface').trim(),
          storeText: getComputedStyle(document.body).getPropertyValue('--store-text').trim(),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
})()"""

out = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme in ['light', 'dark']:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','%s')}catch(e){}" % theme)
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1800)
        out[theme + '_top'] = page.evaluate(JS)
        page.evaluate('window.scrollTo(0, 1200)')
        page.wait_for_timeout(500)
        out[theme + '_scrolled'] = page.evaluate(JS)
        page.screenshot(path='/root/alwled/frontend/tools/qa/stage2c/%s-390-%s.png' % (TAG, theme))
        ctx.close()
    b.close()

print(json.dumps(out, ensure_ascii=False, indent=2))
with open('/root/alwled/frontend/tools/qa/stage2c/dark-%s.json' % TAG, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
