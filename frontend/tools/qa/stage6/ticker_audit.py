import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage6/'
import os
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    R = {}
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(3000)
        p.evaluate('location.hash = "#/"'); p.wait_for_timeout(2600)
        R['info_%d' % w] = p.evaluate("""(() => { const t = document.getElementById('shop-home-ticker');
          if (!t) return null; const cs = getComputedStyle(t); const vp = t.querySelector('.shop-home-ticker__viewport');
          const tr = t.querySelector('.shop-home-ticker__track'); const it = t.querySelector('.shop-home-ticker__item');
          const b = t.getBoundingClientRect();
          return { box: [Math.round(b.width), Math.round(b.height)], bg: cs.backgroundColor, col: cs.color,
            items: t.querySelectorAll('.shop-home-ticker__item').length,
            track_w: Math.round(tr.getBoundingClientRect().width), vp_w: Math.round(vp.getBoundingClientRect().width),
            item_fs: getComputedStyle(it).fontSize, item_lh: getComputedStyle(it).lineHeight,
            aria_hidden_viewport: vp.getAttribute('aria-hidden'),
            dup_hidden: Array.from(tr.children).filter(c => c.getAttribute('aria-hidden') === 'true').length,
            hidden_txt: (t.querySelector('.visually-hidden') || {}).textContent,
            anim: getComputedStyle(tr).animation, dur: getComputedStyle(t).getPropertyValue('--store-ticker-duration'),
            dir: cs.direction, marginTop: cs.marginTop }; })()""")
        # قياس اتجاه الحركة
        p.evaluate("document.getElementById('shop-home-ticker').scrollIntoView({block:'center'})"); p.wait_for_timeout(400)
        t1 = p.evaluate("getComputedStyle(document.querySelector('.shop-home-ticker__track')).transform")
        p.wait_for_timeout(2500)
        t2 = p.evaluate("getComputedStyle(document.querySelector('.shop-home-ticker__track')).transform")
        R['move_%d' % w] = {'t1': t1, 't2': t2}
        el = p.query_selector('#shop-home-ticker')
        el.screenshot(path=OUT + 'ticker-%d.png' % w)
        # 200%
        p.evaluate("document.documentElement.style.fontSize='200%'"); p.wait_for_timeout(900)
        R['zoom_%d' % w] = p.evaluate("""(() => { const t = document.getElementById('shop-home-ticker');
          const vp = t.querySelector('.shop-home-ticker__viewport'); const tr = t.querySelector('.shop-home-ticker__track');
          const it = t.querySelector('.shop-home-ticker__item'); const b = t.getBoundingClientRect();
          return { box: [Math.round(b.width), Math.round(b.height)], vp: [Math.round(vp.getBoundingClientRect().width), Math.round(vp.getBoundingClientRect().height)],
            item_fs: getComputedStyle(it).fontSize, item_lh: getComputedStyle(it).lineHeight,
            track_h: Math.round(tr.getBoundingClientRect().height), clipped: tr.scrollHeight > vp.clientHeight + 1 || tr.getBoundingClientRect().height > vp.getBoundingClientRect().height + 1,
            ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
        el = p.query_selector('#shop-home-ticker')
        el.screenshot(path=OUT + 'ticker-%d-zoom200.png' % w)
        p.evaluate("document.documentElement.style.fontSize=''")
        ctx.close()
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1)[:2600])
