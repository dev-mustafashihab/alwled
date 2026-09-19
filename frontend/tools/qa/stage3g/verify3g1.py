"""PHASE 3 · STEP 3G.1 — التحقق بعد إخفاء «المتوفر فقط» + انحدارات كاملة."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3g'
R = {'console': [], 'failed': [], 'matrix': {}, 'filters': {}, 'sheet': {}, 'misc': {}}

A11Y = r"""(() => {
  const q = s => document.querySelector(s);
  const sheet = q('.shop-filters__sheet');
  const toggle = q('#shop-filters-toggle');
  const wrap = q('.shop-filters');
  const toolbar = q('#shop-toolbar');
  const fields = Array.from(document.querySelectorAll('#shop-toolbar .shop-toolbar__field'));
  const checks = Array.from(document.querySelectorAll('#shop-toolbar .shop-check'));
  const vis = el => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  return {
    vw: window.innerWidth,
    inStockEl: document.querySelectorAll('#shop-filter-instock').length,
    inStockLabelText: Array.from(document.querySelectorAll('#shop-toolbar span, #shop-toolbar label'))
      .filter(el => (el.textContent || '').indexOf('المتوفر') !== -1 && !el.querySelector('input')).length,
    toolbarFields: fields.length,
    toolbarVisibleFields: fields.filter(vis).length,
    toolbarChecks: checks.length,
    checkLabels: checks.map(c => (c.textContent || '').trim()),
    zeroSizedInToolbar: Array.from(document.querySelectorAll('#shop-toolbar > *')).filter(el => {
      const b = el.getBoundingClientRect(); return b.width === 0 || b.height === 0; }).map(el => String(el.className).slice(0, 30)),
    toolbarH: toolbar ? Math.round(toolbar.getBoundingClientRect().height) : null,
    toolbarRows: toolbar ? new Set(Array.from(toolbar.children).map(el => Math.round(el.getBoundingClientRect().y))).size : null,
    sheet: sheet ? { role: sheet.getAttribute('role'), modal: sheet.getAttribute('aria-modal'),
      labelledby: sheet.getAttribute('aria-labelledby'), visibility: getComputedStyle(sheet).visibility } : null,
    expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    open: wrap ? wrap.classList.contains('is-open') : null,
    body: getComputedStyle(document.body).overflowY,
    html: getComputedStyle(document.documentElement).overflowY,
    focus: document.activeElement ? { id: document.activeElement.id, cls: String(document.activeElement.className).slice(0, 34),
      inSheet: !!document.activeElement.closest('.shop-filters__sheet') } : null,
    sheetFocusables: sheet ? Array.from(sheet.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter(vis).map(el => ({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 30) })) : [],
    card: (() => { const c = q('#shop-view > .shop-grid .shop-card'); if (!c) return null; const b = c.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
    taxo: (() => { const t = q('#shop-view > .shop-taxonomy > .shop-taxonomy__item'); if (!t) return null; const b = t.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
    cards: document.querySelectorAll('#shop-view > .shop-grid .shop-card').length,
    count: (() => { const c = q('.shop-toolbar__count'); return c ? c.textContent.trim() : null; })(),
    headerH: q('.shop-header') ? Math.round(q('.shop-header').getBoundingClientRect().height) : null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    resetBtn: !!q('#shop-view .shop-section__head .btn--ghost'),
    hash: location.hash
  };
})()"""


def products(page, hash='#/products', wait=1900):
    page.evaluate('location.hash = "%s"' % hash)
    page.wait_for_timeout(wait)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ============ A) مصفوفة العروض + الفتح/الإغلاق + الحبس ============
    for w in (390, 768, 769, 1024, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'w': w, 't': m.type, 'x': m.text[:140]}) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: R['console'].append({'w': w, 't': 'pageerror', 'x': str(e)[:140]}))
        page.on('requestfailed', lambda r: R['failed'].append({'w': w, 'u': r.url[-70:]}))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1500)
        products(page)
        R['matrix'][str(w)] = page.evaluate(A11Y)
        m = R['matrix'][str(w)]
        print('%-5d fields=%d visFields=%d checks=%s labels=%s card=%s hdr=%s ov=%s count=%s zero=%s' % (
            w, m['toolbarFields'], m['toolbarVisibleFields'], m['toolbarChecks'], m['checkLabels'],
            m['card'], m['headerH'], m['overflow'], m['count'], m['zeroSizedInToolbar']))
        if w <= 768:
            page.evaluate("document.getElementById('shop-filters-toggle').click()")
            page.wait_for_timeout(800)
            R['sheet']['open_%d' % w] = page.evaluate(A11Y)
            # حبس التركيز: 12 Tab
            seq = []
            for _ in range(12):
                page.keyboard.press('Tab'); page.wait_for_timeout(70)
                seq.append(page.evaluate("""(() => { const a=document.activeElement; return (a.closest('.shop-filters__sheet')?'IN:':'OUT:')+(a.id||String(a.className).slice(0,20)); })()"""))
            R['sheet']['tabs_%d' % w] = seq
            page.keyboard.press('Shift+Tab'); page.wait_for_timeout(100)
            R['sheet']['shift_%d' % w] = page.evaluate("""(() => { const a=document.activeElement; return (a.closest('.shop-filters__sheet')?'IN:':'OUT:')+(a.id||String(a.className).slice(0,20)); })()""")
            page.keyboard.press('Escape'); page.wait_for_timeout(700)
            R['sheet']['escape_%d' % w] = page.evaluate(A11Y)
            print('      sheet: role=%s focus=%s tabs_in=%d/%d escape→open=%s focus=%s body=%s expanded=%s' % (
                R['sheet']['open_%d' % w]['sheet']['role'], R['sheet']['open_%d' % w]['focus']['cls'][:24],
                sum(1 for s in seq if s.startswith('IN:')), len(seq), R['sheet']['escape_%d' % w]['open'],
                R['sheet']['escape_%d' % w]['focus']['id'], R['sheet']['escape_%d' % w]['body'], R['sheet']['escape_%d' % w]['expanded']))
        ctx.close()

    # ============ B) 768 → 769 واللوحة مفتوحة ============
    ctx = b.new_context(viewport={'width': 768, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    products(page)
    page.evaluate("document.getElementById('shop-filters-toggle').click()"); page.wait_for_timeout(700)
    page.set_viewport_size({'width': 769, 'height': 900}); page.wait_for_timeout(900)
    R['misc']['768to769'] = page.evaluate(A11Y)
    page.set_viewport_size({'width': 390, 'height': 900}); page.wait_for_timeout(900)
    R['misc']['back390'] = page.evaluate(A11Y)
    print('768→769: open=%s role=%s body=%s expanded=%s | back390 open=%s body=%s' % (
        R['misc']['768to769']['open'], R['misc']['768to769']['sheet']['role'], R['misc']['768to769']['body'],
        R['misc']['768to769']['expanded'], R['misc']['back390']['open'], R['misc']['back390']['body']))
    ctx.close()

    # ============ C) الفلاتر + ?inStock=1 ============
    ctx = b.new_context(viewport={'width': 1024, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140]}) if m.type == 'error' else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:140]}))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    products(page)
    for name, h in [('base', '#/products'), ('instock1', '#/products?inStock=1'), ('instock0', '#/products?inStock=0'),
                    ('min400', '#/products?minPrice=400'), ('max400', '#/products?maxPrice=400'),
                    ('min99999', '#/products?minPrice=99999'), ('range', '#/products?minPrice=300&maxPrice=600'),
                    ('category', '#/products?categoryId=293'), ('brand', '#/products?brandId=292'),
                    ('sort', '#/products?sortBy=price&sortOrder=asc'), ('offers', '#/products?offers=1'),
                    ('instock_offers', '#/products?inStock=1&offers=1'), ('page2', '#/products?page=2')]:
        reqs.clear()
        page.evaluate('location.hash = "%s"' % h)
        page.wait_for_timeout(1900)
        st = page.evaluate(A11Y)
        R['filters'][name] = {'cards': st['cards'], 'count': st['count'], 'hash': st['hash'],
                              'resetBtn': st['resetBtn'], 'reqs': list(reqs), 'inStockReq': any('inStock' in r for r in reqs),
                              'overflow': st['overflow']}
        print('%-14s cards=%s count=%-9s reset=%-5s inStockReq=%s hash=%s' % (name, st['cards'], st['count'], st['resetBtn'],
                                                                             R['filters'][name]['inStockReq'], st['hash']))
    ctx.close()

    # ============ D) داكن: 390 + 1366 ============
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140]}) if m.type == 'error' else None)
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
        products(page)
        R['matrix']['dark_%d' % w] = page.evaluate(A11Y)
        if w == 390:
            page.evaluate("document.getElementById('shop-filters-toggle').click()"); page.wait_for_timeout(800)
            R['sheet']['dark_open'] = page.evaluate(A11Y)
            page.screenshot(path=os.path.join(OUT, '3g1-dark-sheet-390.png'))
        ctx.close()

    # ============ E) انحدارات: Home / Taxonomy / Search / Header ============
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1600)
        R['misc']['home_%d' % w] = page.evaluate("""(() => { const q=s=>document.querySelector(s);
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height)}; };
          return {headerH: Math.round(q('.shop-header').getBoundingClientRect().height),
            homeCard: box(q('#shop-home-products .shop-card')||q('.shop-home .shop-card')),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()""")
        page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(1900)
        R['misc']['taxo_%d' % w] = page.evaluate(A11Y)
        page.evaluate('location.hash = "#/products?view=brands"'); page.wait_for_timeout(1900)
        R['misc']['brands_%d' % w] = page.evaluate(A11Y)
        if w == 390:
            page.evaluate('location.hash = "#/"'); page.wait_for_timeout(1900)
            page.click('#shop-search-btn'); page.wait_for_timeout(800)
            page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1500)
            R['misc']['search'] = page.evaluate("""(() => { const rows=Array.from(document.querySelectorAll('.shop-search-row'));
              return {rows: rows.length, rowH: rows[0]?Math.round(rows[0].getBoundingClientRect().height):null,
                sheetTop: Math.round(document.querySelector('.shop-search-sheet').getBoundingClientRect().y),
                overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()""")
            page.keyboard.press('Escape'); page.wait_for_timeout(700)
            page.screenshot(path=os.path.join(OUT, '3g1-products-390.png'))
        else:
            page.screenshot(path=os.path.join(OUT, '3g1-products-1366.png'))
        ctx.close()

    # لقطات الشريط على العروض المطلوبة
    for w in (768, 769, 1024):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
        products(page)
        page.screenshot(path=os.path.join(OUT, '3g1-products-%d.png' % w))
        ctx.close()

    b.close()

with open(os.path.join(OUT, 'verify3g1.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nconsole=%d failed=%d' % (len(R['console']), len(R['failed'])))
