"""اختبار حاسم بالقياس: أي عنصر يدخل النافذة من أي حافة، وبأي ترتيب."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(3000)
    p.evaluate('location.hash = "#/"'); p.wait_for_timeout(2600)
    rows = []
    for i in range(8):
        r = p.evaluate("""(() => { const vp = document.querySelector('.shop-home-ticker__viewport'); const vr = vp.getBoundingClientRect();
          const items = Array.from(document.querySelectorAll('.shop-home-ticker__track > .shop-home-ticker__item'));
          const vis = items.map((e, idx) => { const b = e.getBoundingClientRect();
            const inside = b.right > vr.left && b.left < vr.right;
            return inside ? { idx: idx, txt: e.textContent.trim().slice(0, 10), l: Math.round(b.left - vr.left), r: Math.round(b.right - vr.left) } : null; }).filter(Boolean);
          vis.sort((a, c) => c.l - a.l);   // من اليمين إلى اليسار
          return { vp_w: Math.round(vr.width), visible: vis, tf: getComputedStyle(document.querySelector('.shop-home-ticker__track')).transform.split(',')[4] }; })()""")
        rows.append(r)
        p.wait_for_timeout(2200)
    for r in rows:
        txt = ' | '.join('%d:%s(L%s-R%s)' % (v['idx'], v['txt'], v['l'], v['r']) for v in r['visible'])
        print('tf=%-10s vp=%d :: %s' % (r['tf'].strip(), r['vp_w'], txt))
    ctx.close(); b.close()
