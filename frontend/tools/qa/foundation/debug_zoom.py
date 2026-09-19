import json
from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
HARNESS = open('/root/alwled/frontend/tools/qa/foundation/harness.js', encoding='utf-8').read()
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2500)
    p.evaluate(HARNESS); p.evaluate("window.__stwHarness.mount()"); p.wait_for_timeout(500)
    p.evaluate("document.documentElement.style.fontSize='200%'"); p.wait_for_timeout(800)
    r = p.evaluate("""(() => { const out = {};
      ['#stw-t-primary','#stw-t-disabled','#stw-t-input','.stw-choice','#stw-t-secondary'].forEach(s => {
        const e = document.querySelector(s); if (!e) return; const cs = getComputedStyle(e); const b = e.getBoundingClientRect();
        out[s] = { box: [Math.round(b.width), Math.round(b.height)], sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight,
          ovX: e.scrollWidth - e.clientWidth, ovY: e.scrollHeight - e.clientHeight, ws: cs.whiteSpace, of: cs.overflow,
          txt: (e.textContent || '').trim().slice(0, 18), parent: e.parentElement.className.slice(0, 30),
          pw: Math.round(e.parentElement.getBoundingClientRect().width) }; });
      const w = document.querySelector('#stw-foundation-harness');
      out._wrapper = { box: [Math.round(w.getBoundingClientRect().width), Math.round(w.getBoundingClientRect().height)], maxW: getComputedStyle(w).maxWidth, of: getComputedStyle(w).overflow };
      return out; })()""")
    print(json.dumps(r, ensure_ascii=False, indent=1)[:1800])
    ctx.close(); b.close()