"""PHASE 4 · 4C — المصفوفة النهائية + الحالات النظيفة + الانحدارات (بناء 4B.2 المُصلَح)."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage4c'
os.makedirs(OUT, exist_ok=True)
R = {'console': [], 'failed': [], 'matrix': {}, 'states': {}, 'regression': {}, 'shots': []}
WIDTHS = [360, 390, 430, 600, 768, 769, 900, 1023, 1024, 1280, 1366, 1440, 1920]

PDP = r"""(() => {
  const q = s => document.querySelector(s);
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
  const prod = q('.shop-product');
  const rel = q('#shop-view > .shop-section--related .shop-card');
  const add = q('#shop-add-to-cart');
  const act = q('.shop-buy__actions');
  const vh = window.innerHeight;
  return { vw: window.innerWidth, cols: prod ? getComputedStyle(prod).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    stage: box(q('.shop-gallery__stage')), gallery: box(q('.shop-gallery')),
    add: add ? { text: add.textContent.trim(), disabled: add.disabled, box: box(add) } : null, qty: box(q('.shop-qty')),
    facts: document.querySelectorAll('.shop-buy__facts .shop-fact').length, factsH: (box(q('.shop-buy__facts')) || {}).h,
    panels: document.querySelectorAll('.shop-panel').length,
    rel: rel ? box(rel) : null, relMedia: rel ? box(rel.querySelector('.shop-card__media')) : null,
    ctaInFold: act ? act.getBoundingClientRect().bottom <= vh : null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docH: Math.round(document.documentElement.scrollHeight) };
})()"""

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ===== A) مصفوفة نهائية =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:130], 'k': 'matrix'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:130]}))
    page.on('requestfailed', lambda r: R['failed'].append(r.url[-50:]))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    for w in WIDTHS:
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(400)
        page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2500)
        m = page.evaluate(PDP)
        R['matrix'][str(w)] = m
        print('%-5d cols=%s stage=%sx%s rel=%sx%s facts=%s(%s) panels=%s cta=%s/%s fold=%s ov=%s docH=%s' % (
            w, m['cols'], m['stage']['w'], m['stage']['h'], m['rel']['w'], m['rel']['h'], m['facts'], m['factsH'], m['panels'],
            m['add']['text'][:14], m['add']['box']['w'], m['ctaInFold'], m['overflow'], m['docH']))
        if w in (390, 1024, 1366):
            p = os.path.join(OUT, 'final-pdp-%d.png' % w); page.screenshot(path=p); R['shots'].append(p)
    ctx.close()

    # ===== B) الحالات النظيفة (سياق جديد = بلا كاش) =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:130], 'k': 'states'}) if m.type in ('error', 'warning') else None)

    def delay(route):
        page.wait_for_timeout(4000)
        route.continue_()
    page.route('**/api/v1/products/*', delay)
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(1400)
    R['states']['loading'] = page.evaluate("""(() => { const s=document.querySelector('#shop-view > .shop-section'); const n=document.querySelector('#shop-view .shop-note');
      const sk=Array.from(document.querySelectorAll('.skeleton'));
      return { busy: s&&s.getAttribute('aria-busy'), note: n&&n.textContent.trim(), role: n&&n.getAttribute('role'),
        skel: sk.length, skelHidden: sk.every(x=>x.getAttribute('aria-hidden')==='true'),
        overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
    print('\nloading:', R['states']['loading'])
    ctx.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:130], 'k': 'states'}) if m.type in ('error', 'warning') else None)
    page.route('**/api/v1/products/*', lambda r: r.abort())
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2400)
    R['states']['error'] = page.evaluate("""(() => { const s=document.querySelector('#shop-view > .state'); const b=s&&s.querySelector('.btn');
      return { role: s&&s.getAttribute('role'), title: (s&&s.querySelector('.state__title')||{}).textContent,
        retry: b?{text:b.textContent.trim(), box:(()=>{const r=b.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height);})()}:null,
        overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
    print('error:', R['states']['error'])
    ctx.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    page.evaluate('location.hash = "#/products/999999"'); page.wait_for_timeout(2400)
    R['states']['notfound'] = page.evaluate("""(() => { const s=document.querySelector('#shop-view > .state'); const a=s&&s.querySelector('a.btn');
      return { role: s&&s.getAttribute('role'), title: (s&&s.querySelector('.state__title')||{}).textContent, cta: a&&a.getAttribute('href') }; })()""")
    print('notfound:', R['states']['notfound'])
    ctx.close()

    # ===== C) الانحدارات المقفلة =====
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:130], 'k': 'reg'}) if m.type in ('error', 'warning') else None)
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(3200)
        R['regression']['home_%d' % w] = page.evaluate("""(() => { const q=s=>document.querySelector(s);
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); };
          const c=q('#shop-view .shop-card');
          return { headerH: Math.round(q('.shop-header').getBoundingClientRect().height), homeCard: box(c), homeMedia: box(c.querySelector('.shop-card__media')),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2200)
        R['regression']['listing_%d' % w] = page.evaluate("""(() => { const q=s=>document.querySelector(s);
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); };
          return { card: box(q('#shop-view > .shop-grid .shop-card')), headerH: Math.round(q('.shop-header').getBoundingClientRect().height),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(2200)
        R['regression']['taxo_%d' % w] = page.evaluate("""(() => { const t=document.querySelector('#shop-view > .shop-taxonomy > .shop-taxonomy__item');
          const b=t.getBoundingClientRect(); return { taxo: Math.round(b.width)+'x'+Math.round(b.height), overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        if w == 390:
            page.evaluate('location.hash = "#/"'); page.wait_for_timeout(1800)
            page.click('#shop-search-btn'); page.wait_for_timeout(800)
            page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1600)
            R['regression']['search'] = page.evaluate("""(() => { const r=document.querySelector('.shop-search-row');
              return { rowH: r?Math.round(r.getBoundingClientRect().height):null, rows: document.querySelectorAll('.shop-search-row').length }; })()""")
        ctx.close()

    b.close()

with open(os.path.join(OUT, 'final4c.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n== انحدارات ==', json.dumps(R['regression'], ensure_ascii=False))
print('console=%d failed=%d' % (len(R['console']), len(R['failed'])))
