"""PHASE 4 · 4B.2 + 4B.3 + 4C — بوابة QA شاملة (مشابهة/معلومات/حالات/إتاحة/مصفوفة/انحدارات)."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage4b'
R = {'console': [], 'failed': [], 'm42': {}, 'matrix': {}, 'theme': {}, 'states': {}, 'a11y': {}, 'regression': {}, 'shots': []}
WIDTHS = [360, 390, 430, 600, 768, 769, 900, 1023, 1024, 1280, 1366, 1440, 1920]
GOOD = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="%23e2e8f0"/></svg>'
BAD = 'https://panel.fahd-car.cloud/alwled/shop/assets/icons/broken-image-xyz.png'

PDP = r"""(() => {
  const q = s => document.querySelector(s);
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.y), bottom: Math.round(b.bottom) }; };
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const prod = q('.shop-product');
  const rel = q('#shop-view > .shop-section .shop-card');
  const add = q('#shop-add-to-cart');
  const vh = window.innerHeight;
  const act = box(q('.shop-buy__actions'));
  return {
    vw: window.innerWidth, vh: vh,
    cols: prod ? getComputedStyle(prod).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    gallery: box(q('.shop-gallery')), stage: box(q('.shop-gallery__stage')),
    add: add ? { text: add.textContent.trim(), disabled: add.disabled, box: box(add) } : null,
    qty: box(q('.shop-qty')),
    factsCells: document.querySelectorAll('.shop-buy__facts .shop-fact').length,
    factsBox: box(q('.shop-buy__facts')), factsCols: cs(q('.shop-buy__facts'), 'gridTemplateColumns'),
    metaSpans: (() => { const m = q('.shop-buy .shop-card__meta'); return m ? m.children.length : 0; })(),
    actions: act, ctaAboveFold: act ? act.bottom <= vh : null,
    panels: Array.from(document.querySelectorAll('.shop-panel')).map(p => ({ title: (p.querySelector('.shop-panel__title') || {}).textContent,
      text: (p.querySelector('.shop-prose') || {}).textContent ? String((p.querySelector('.shop-prose') || {}).textContent).slice(0, 40) : null })),
    crumbCurrent: document.querySelectorAll('.shop-crumbs [aria-current="page"]').length,
    related: rel ? { card: box(rel), media: box(rel.querySelector('.shop-card__media')), mediaAspect: cs(rel.querySelector('.shop-card__media'), 'aspectRatio'),
      details: cs(rel.querySelector('.shop-card__details'), 'display'), desc: cs(rel.querySelector('.shop-card__desc'), 'display'),
      metaSpans: (rel.querySelector('.shop-card__meta') || {}).children ? rel.querySelector('.shop-card__meta').children.length : 0,
      addW: box(rel.querySelector('.shop-card__add')), cards: document.querySelectorAll('#shop-view > .shop-section .shop-card').length } : null,
    relatedErr: !!q('.shop-section--related-error'),
    placeholder: (() => { const p = q('.shop-gallery__stage .shop-card__placeholder'); return p ? cs(p, 'backgroundImage') : null; })(),
    stageImg: (() => { const i = q('.shop-gallery__stage img'); return i ? { w: i.naturalWidth, box: box(i) } : null; })(),
    priceIsolate: cs(q('.shop-price__now'), 'unicodeBidi'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docH: Math.round(document.documentElement.scrollHeight),
    note: !!q('.shop-buy .shop-note')
  };
})()"""


def go(page, h, wait=2500):
    page.evaluate('location.hash = "%s"' % h)
    page.wait_for_timeout(wait)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ===== A) مصفوفة 13 عرضًا (632) =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140], 'k': 'matrix'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:140]}))
    page.on('requestfailed', lambda r: R['failed'].append({'u': r.url[-55:]}))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    for w in WIDTHS:
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(400)
        go(page, '#/products/632')
        m = page.evaluate(PDP)
        R['matrix'][str(w)] = m
        print('%-5d cols=%s stage=%sx%s rel=%s media=%sx%s facts=%s(%s) cta=%sx%s aboveFold=%s ov=%s docH=%s' % (
            w, m['cols'], m['stage'] and m['stage']['w'], m['stage'] and m['stage']['h'],
            m['related'] and ('%dx%d' % (m['related']['card']['w'], m['related']['card']['h'])),
            m['related'] and m['related']['media']['w'], m['related'] and m['related']['media']['h'],
            m['factsCells'], m['factsBox'] and m['factsBox']['h'], m['add'] and m['add']['box']['w'], m['add'] and m['add']['box']['h'],
            m['ctaAboveFold'], m['overflow'], m['docH']))
        if w in (390, 768, 1024, 1366):
            p = os.path.join(OUT, 'v2-pdp-%d.png' % w); page.screenshot(path=p); R['shots'].append(p)
    ctx.close()

    # ===== B) فاتح/داكن × 632/633 (390/768/1024/1366) =====
    for w in (390, 768, 1024, 1366):
        for theme in ('light', 'dark'):
            for pid in (632, 633):
                ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
                if theme == 'dark':
                    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
                page = ctx.new_page()
                page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140], 'k': 'theme'}) if m.type in ('error', 'warning') else None)
                page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
                go(page, '#/products/%d' % pid, 2600)
                m = page.evaluate(PDP)
                R['theme']['%d_%s_%d' % (w, theme, pid)] = {k: m[k] for k in ['add', 'factsCells', 'related', 'panels', 'crumbCurrent', 'overflow', 'note']}
                print('%-4d %-5s %d: add=%s/%s rel=%sx%s facts=%s panels=%d current=%d note=%s' % (
                    w, theme, pid, m['add']['text'], m['add']['disabled'],
                    m['related'] and m['related']['card']['w'], m['related'] and m['related']['card']['h'],
                    m['factsCells'], len(m['panels']), m['crumbCurrent'], m['note']))
                if theme == 'dark' and w == 390:
                    p = os.path.join(OUT, 'v2-dark-390-%d.png' % pid); page.screenshot(path=p); R['shots'].append(p)
                ctx.close()

    # ===== C) حالات: مشابهة فاشلة + صورة مكسورة + تحميل/خطأ/غير موجود =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140], 'k': 'states'}) if m.type in ('error', 'warning') else None)

    def mock(payload_mutate=None, fail_related=False):
        def handler(route):
            u = route.request.url
            if 'categoryId' in u and fail_related:
                route.abort(); return
            try:
                data = route.fetch().json()
                it = data.get('data', data)
                if payload_mutate and '/products/' in u:
                    payload_mutate(it)
                route.fulfill(status=200, content_type='application/json', body=json.dumps(data, ensure_ascii=False))
            except Exception:
                route.continue_()
        page.route('**/api/v1/products*', handler)
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    # مشابهة فاشلة
    mock(fail_related=True)
    go(page, '#/products/632', 2600)
    R['states']['related_error'] = page.evaluate("""(() => ({ note: !!document.querySelector('.shop-section--related-error'),
      text: (document.querySelector('.shop-section--related-error .shop-note') || {}).textContent,
      role: (document.querySelector('.shop-section--related-error .shop-note') || {}).getAttribute ? document.querySelector('.shop-section--related-error .shop-note').getAttribute('role') : null,
      cards: document.querySelectorAll('#shop-view > .shop-section .shop-card').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }))()""")
    print('\nrelated_error:', R['states']['related_error'])
    page.unroute('**/api/v1/products*')
    # صورة مكسورة
    mock(lambda it: it.update({'images': [{'url': BAD}], 'primaryImage': {'url': BAD}}))
    go(page, '#/products/632', 2800)
    R['states']['broken_image'] = page.evaluate("""(() => ({ hasImg: !!document.querySelector('.shop-gallery__stage img'),
      placeholder: !!document.querySelector('.shop-gallery__stage .shop-card__placeholder'),
      stageH: Math.round(document.querySelector('.shop-gallery__stage').getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }))()""")
    print('broken_image:', R['states']['broken_image'])
    page.unroute('**/api/v1/products*')
    # وصف من shortDescription (البيانات الحقيقية)
    go(page, '#/products/632', 2500)
    R['states']['description_real'] = page.evaluate("""(() => ({ panels: Array.from(document.querySelectorAll('.shop-panel')).map(p=>({t:(p.querySelector('.shop-panel__title')||{}).textContent,
      x:String((p.querySelector('.shop-prose')||{}).textContent||'').slice(0,50)})), h2: Array.from(document.querySelectorAll('h2')).map(h=>h.textContent.trim()) }))()""")
    print('description (بيانات حقيقية):', json.dumps(R['states']['description_real'], ensure_ascii=False))
    # تحميل/خطأ/غير موجود
    page.route('**/api/v1/products*', lambda r: None)
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(1200)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(1500)
    R['states']['loading'] = page.evaluate("""(() => { const s=document.querySelector('#shop-view > .shop-section'); const n=document.querySelector('#shop-view .shop-note');
      return { busy: s&&s.getAttribute('aria-busy'), note: n&&n.textContent.trim(), role: n&&n.getAttribute('role'), overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
    page.unroute('**/api/v1/products*')
    page.route('**/api/v1/products*', lambda r: r.abort())
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(1200)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2000)
    R['states']['error'] = page.evaluate("({role:(document.querySelector('#shop-view > .state')||{}).getAttribute?document.querySelector('#shop-view > .state').getAttribute('role'):null, title:(document.querySelector('.state__title')||{}).textContent})")
    page.unroute('**/api/v1/products*')
    page.evaluate('location.hash = "#/products/999999"'); page.wait_for_timeout(2300)
    R['states']['notfound'] = page.evaluate("({role:(document.querySelector('#shop-view > .state')||{}).getAttribute?document.querySelector('#shop-view > .state').getAttribute('role'):null, title:(document.querySelector('.state__title')||{}).textContent})")
    print('loading/error/notfound:', R['states']['loading'], R['states']['error'], R['states']['notfound'])
    # إتاحة
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2500)
    R['a11y'] = page.evaluate(r"""(() => {
      const qa = s => Array.from(document.querySelectorAll(s));
      const vis = el => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      const TAB = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
      const ids = qa('[id]').map(e => e.id);
      const inNamed = el => { const c = el.closest('details'); return c && !c.open; };
      return { dupIds: ids.filter((v, i) => ids.indexOf(v) !== i),
        hiddenTabbableReal: qa(TAB).filter(el => { if (!vis(el)) { const cs = getComputedStyle(el); if (cs.display === 'none') return false;
          let p = el.parentElement, hidden = false; while (p) { const pcs = getComputedStyle(p); if (pcs.display === 'none' || pcs.visibility === 'hidden') { hidden = true; break; } p = p.parentElement; }
          return !hidden; } return false; }).length,
        headings: qa('h1,h2,h3').map(h => h.tagName + ':' + h.textContent.trim().slice(0, 22)),
        crumbCurrent: qa('.shop-crumbs [aria-current="page"]').length,
        facts: qa('.shop-buy__facts .shop-fact').length,
        relCards: qa('#shop-view > .shop-section .shop-card').length }; })()""")
    print('a11y:', json.dumps(R['a11y'], ensure_ascii=False))
    ctx.close()

    # ===== D) انحدارات المراحل المقفلة =====
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140], 'k': 'reg'}) if m.type in ('error', 'warning') else None)
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1600)
        R['regression']['home_%d' % w] = page.evaluate("""(() => { const q=s=>document.querySelector(s);
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); };
          return { headerH: Math.round(q('.shop-header').getBoundingClientRect().height), homeCard: box(q('#shop-home-products .shop-card')||q('.shop-home .shop-card')),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2100)
        R['regression']['listing_%d' % w] = page.evaluate("""(() => { const c=document.querySelector('#shop-view > .shop-grid .shop-card');
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); };
          return { card: box(c), details: getComputedStyle(c.querySelector('.shop-card__details')).display,
            media: box(c.querySelector('.shop-card__media')), overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(2100)
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

with open(os.path.join(OUT, 'verify4b2.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n== انحدارات ==', json.dumps(R['regression'], ensure_ascii=False))
print('console=%d failed=%d shots=%d' % (len(R['console']), len(R['failed']), len(R['shots'])))
