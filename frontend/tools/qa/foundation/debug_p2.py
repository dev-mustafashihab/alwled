import json
from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w in (1366, 390):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2600)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(2400)
        r = p.evaluate("""(() => {
          const inner = document.querySelector('.shop-header__inner');
          const kids = Array.from(inner.children).map(e => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
            return { cls: (e.className||e.id||e.tagName).toString().slice(0,26), vis: cs.display !== 'none' && !!b.width,
              w: Math.round(b.width), h: Math.round(b.height), fs: cs.fontSize }; });
          const nav = document.querySelector('.shop-nav__link[aria-current="page"]');
          const ncs = nav ? getComputedStyle(nav) : null;
          const search = document.querySelector('.shop-search');
          const sb = search ? search.getBoundingClientRect() : null;
          return { kids: kids, navActive: nav ? { text: nav.textContent.trim(), bg: ncs.backgroundColor, col: ncs.color, fw: ncs.fontWeight,
            afterBg: getComputedStyle(nav, '::after').backgroundColor, afterH: getComputedStyle(nav, '::after').height } : null,
            searchW: sb ? Math.round(sb.width) : 0, innerW: Math.round(inner.getBoundingClientRect().width),
            hdrH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
            ov: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        })()""")
        print('=== عرض', w, '==='); print(json.dumps(r, ensure_ascii=False, indent=1)[:1500])
        ctx.close()
    b.close()