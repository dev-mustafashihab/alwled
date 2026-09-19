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
      const panel = document.querySelector('.shop-drawer__panel');
      const scroll = document.getElementById('shop-menu-scroll');
      const out = [];
      // ترتيب العناصر داخل منطقة التمرير
      Array.from(scroll.children).forEach((el, i) => {
        const vis = el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none';
        out.push({ i: i, tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 26),
          id: el.id || '', vis: vis, txt: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40) });
      });
      // أبناء اللوحة (الترتيب الكامل)
      const panelKids = Array.from(panel.children).map(el => ({ cls: String(el.className).slice(0, 24), id: el.id || '', txt: (el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,30) }));
      // روابط الدُرج بترتيب ظهورها المرئي (من الأعلى)
      const links = Array.from(document.querySelectorAll('.shop-drawer__link')).map(el => {
        const b = el.getBoundingClientRect();
        return { top: Math.round(b.top), h: Math.round(b.height), txt: (el.textContent||'').trim().replace(/\\s+/g,' ').slice(0, 26), cur: el.getAttribute('aria-current') || '' };
      }).sort((a, c) => a.top - c.top);
      return { scrollKids: out, panelKids: panelKids, links: links };
    })()""")
    print(json.dumps(r, ensure_ascii=False, indent=1)[:2600])
    ctx.close(); b.close()