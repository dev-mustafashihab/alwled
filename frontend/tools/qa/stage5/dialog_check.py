import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2400)
        p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(2500)
        p.click('#shop-add-to-cart'); p.wait_for_timeout(1500)
        r = p.evaluate("""(() => { const out = { dialogs: [] };
          document.querySelectorAll('.modal, [role=dialog], dialog').forEach(d => {
            const b = d.getBoundingClientRect(); if (!b.width) return;
            const ins = Array.from(d.querySelectorAll('input, select, textarea')).map(e => ({
              t: e.type || e.tagName, cls: String(e.className).slice(0, 18), fs: getComputedStyle(e).fontSize,
              box: Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height) }));
            const btns = Array.from(d.querySelectorAll('button, .btn')).map(e => ({ cls: String(e.className).slice(0, 20),
              box: Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height) }));
            out.dialogs.push({ cls: String(d.className).slice(0, 24), inputs: ins, btns: btns.slice(0, 5) }); });
          return out; })()""")
        print(w, json.dumps(r, ensure_ascii=False)[:900])
        ctx.close()
    b.close()
