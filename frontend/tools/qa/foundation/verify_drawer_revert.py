import json
from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2600)
    p.click('#shop-burger'); p.wait_for_timeout(1000)
    r = p.evaluate("""(() => {
      const panel = document.querySelector('.shop-drawer__panel'); const pcs = getComputedStyle(panel);
      const link = document.querySelector('.shop-drawer__link'); const lcs = link ? getComputedStyle(link) : null;
      const lb = link ? link.getBoundingClientRect() : null;
      const active = document.querySelector('.shop-drawer__link[aria-current="page"]');
      const th = document.querySelector('.shop-menu__theme-btn');
      const theme = document.querySelector('.shop-menu__theme');
      const foot = document.querySelector('.shop-drawer__foot .btn--primary');
      return {
        panel: { w: Math.round(panel.getBoundingClientRect().width), maxW: pcs.maxWidth, bg: pcs.backgroundColor, shadow: pcs.boxShadow.slice(0, 24) },
        link: lcs ? { h: Math.round(lb.height), pad: lcs.paddingTop + ' ' + lcs.paddingInlineEnd, radius: lcs.borderTopLeftRadius, margin: lcs.marginInlineStart, fs: lcs.fontSize, bg: lcs.backgroundColor, color: lcs.color } : null,
        active: active ? { bg: getComputedStyle(active).backgroundColor, color: getComputedStyle(active).color, fw: getComputedStyle(active).fontWeight, before: getComputedStyle(active, '::before').content } : null,
        themeBtn: th ? { bg: getComputedStyle(th).backgroundColor, radius: getComputedStyle(th).borderTopLeftRadius, h: Math.round(th.getBoundingClientRect().height) } : null,
        themeWrap: theme ? { bg: getComputedStyle(theme).backgroundColor, border: getComputedStyle(theme).borderTopWidth, radius: getComputedStyle(theme).borderTopLeftRadius } : null,
        foot: foot ? { bg: getComputedStyle(foot).backgroundColor, color: getComputedStyle(foot).color } : null,
        backdrop: getComputedStyle(document.querySelector('.shop-drawer'), '::before').content,
        ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        order: Array.from(document.querySelectorAll('.shop-drawer__link')).map(e => e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 18))
      };
    })()""")
    print(json.dumps(r, ensure_ascii=False, indent=1)[:1800])
    p.screenshot(path='/root/alwled/frontend/tools/qa/foundation/p2-drawer-390.png')
    ctx.close(); b.close()
