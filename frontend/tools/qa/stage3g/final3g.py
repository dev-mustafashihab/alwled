"""PHASE 3 — التحقق النهائي (قراءة فقط · بلا أي تعديل على المصدر)."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3g'
R = {'console': [], 'failed': [], 'dupIds': {}, 'orphanLabels': {}, 'closedTabbable': {}, 'matrix': {}, 'filters': {}, 'sheet': {}, 'misc': {}}

PROBE = r"""(() => {
  const q = s => document.querySelector(s);
  const vis = el => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const TAB = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const sheet = q('.shop-filters__sheet');
  const toggle = q('#shop-filters-toggle');
  const wrap = q('.shop-filters');
  const toolbar = q('#shop-toolbar');
  const fields = Array.from(document.querySelectorAll('#shop-toolbar .shop-toolbar__field'));
  // IDs مكرّرة
  const ids = Array.from(document.querySelectorAll('[id]')).map(e => e.id);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  // labels يتيمة (for يشير إلى عنصر غير موجود)
  const orphan = Array.from(document.querySelectorAll('label[for]')).map(l => l.getAttribute('for'))
    .filter(f => !document.getElementById(f));
  return {
    vw: window.innerWidth,
    inStockVisible: Array.from(document.querySelectorAll('#shop-toolbar input, #shop-toolbar label, #shop-toolbar span'))
      .filter(el => { const t = (el.textContent || '').trim(); return vis(el) && (el.id === 'shop-filter-instock' || t === 'المتوفر فقط' || t === 'التوفر'); }).length,
    inStockAny: document.querySelectorAll('#shop-filter-instock').length,
    inStockTabbable: Array.from(document.querySelectorAll(TAB)).filter(el => el.id === 'shop-filter-instock' && vis(el)).length,
    dupIds: dup,
    orphanLabels: orphan,
    closedSheetTabbable: sheet && !(wrap && wrap.classList.contains('is-open')) ? Array.from(sheet.querySelectorAll(TAB)).filter(vis).length : null,
    fields: fields.length, fieldsVisible: fields.filter(vis).length,
    zeroSlots: fields.filter(el => { const b = el.getBoundingClientRect(); return (wrap && wrap.classList.contains('is-open')) && (b.width === 0 || b.height === 0); }).length,
    toolbarH: toolbar ? Math.round(toolbar.getBoundingClientRect().height) : null,
    desktopControlsUsable: fields.filter(el => { const f = el.querySelector('input, select'); return f && !f.disabled && vis(f); }).length,
    sheet: sheet ? { role: sheet.getAttribute('role'), modal: sheet.getAttribute('aria-modal'),
      labelledby: sheet.getAttribute('aria-labelledby'), visibility: getComputedStyle(sheet).visibility } : null,
    open: wrap ? wrap.classList.contains('is-open') : null, expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    body: getComputedStyle(document.body).overflowY, html: getComputedStyle(document.documentElement).overflowY,
    focus: document.activeElement ? { id: document.activeElement.id, cls: String(document.activeElement.className).slice(0, 32),
      inSheet: !!document.activeElement.closest('.shop-filters__sheet') } : null,
    sheetFocusables: sheet ? Array.from(sheet.querySelectorAll(TAB)).filter(vis).map(el => el.id || String(el.className).slice(0, 20)) : [],
    card: (() => { const c = q('#shop-view > .shop-grid .shop-card'); if (!c) return null; const b = c.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
    taxo: (() => { const t = q('#shop-view > .shop-taxonomy > .shop-taxonomy__item'); if (!t) return null; const b = t.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
    cards: document.querySelectorAll('#shop-view > .shop-grid .shop-card').length,
    count: (() => { const c = q('.shop-toolbar__count'); return c ? c.textContent.trim() : null; })(),
    headerH: q('.shop-header') ? Math.round(q('.shop-header').getBoundingClientRect().height) : null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    resetBtn: !!q('#shop-view .shop-section__head .btn--ghost'),
    hash: location.hash
  };
})()"""


def products(page, h='#/products', wait=1900):
    page.evaluate('location.hash = "%s"' % h)
    page.wait_for_timeout(wait)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ===== A) مصفوفة + اللوحة المغلقة =====
    for w in (390, 768, 769, 1024, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'w': w, 't': m.type, 'x': m.text[:140]}) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: R['console'].append({'w': w, 't': 'pageerror', 'x': str(e)[:140]}))
        page.on('requestfailed', lambda r: R['failed'].append({'w': w, 'u': r.url[-60:]}))
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
        products(page)
        m = page.evaluate(PROBE)
        R['matrix'][str(w)] = m
        R['dupIds'][str(w)] = m['dupIds']; R['orphanLabels'][str(w)] = m['orphanLabels']; R['closedTabbable'][str(w)] = m['closedSheetTabbable']
        print('%-5d inStockVis=%s any=%s tabbable=%s dupIds=%s orphan=%s closedTabbable=%s fields=%s/%s toolbarH=%s card=%s hdr=%s ov=%s' % (
            w, m['inStockVisible'], m['inStockAny'], m['inStockTabbable'], m['dupIds'], m['orphanLabels'],
            m['closedSheetTabbable'], m['fieldsVisible'], m['fields'], m['toolbarH'], m['card'], m['headerH'], m['overflow']))
        if w <= 768:
            page.evaluate("document.getElementById('shop-filters-toggle').click()"); page.wait_for_timeout(800)
            R['sheet']['open_%d' % w] = page.evaluate(PROBE)
            seq = []
            for _ in range(11):
                page.keyboard.press('Tab'); page.wait_for_timeout(70)
                seq.append(page.evaluate("""(() => { const a=document.activeElement; return (a.closest('.shop-filters__sheet')?'IN:':'OUT:')+(a.id||String(a.className).slice(0,18)); })()"""))
            R['sheet']['tabs_%d' % w] = seq
            page.keyboard.press('Shift+Tab'); page.wait_for_timeout(120)
            R['sheet']['shift_%d' % w] = page.evaluate("""(() => { const a=document.activeElement; return (a.closest('.shop-filters__sheet')?'IN:':'OUT:')+(a.id||String(a.className).slice(0,18)); })()""")
            page.keyboard.press('Escape'); page.wait_for_timeout(700)
            R['sheet']['after_escape_%d' % w] = page.evaluate(PROBE)
            print('      sheet role=%s focus=%s in=%d/%d shift=%s | escape open=%s focus=%s body=%s expanded=%s' % (
                R['sheet']['open_%d' % w]['sheet']['role'], R['sheet']['open_%d' % w]['focus']['cls'][:22],
                sum(1 for s in seq if s.startswith('IN:')), len(seq), R['sheet']['shift_%d' % w],
                R['sheet']['after_escape_%d' % w]['open'], R['sheet']['after_escape_%d' % w]['focus']['id'],
                R['sheet']['after_escape_%d' % w]['body'], R['sheet']['after_escape_%d' % w]['expanded']))
        ctx.close()

    # ===== B) 768 → 769 =====
    ctx = b.new_context(viewport={'width': 768, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140]}) if m.type in ('error', 'warning') else None)
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    products(page)
    page.evaluate("document.getElementById('shop-filters-toggle').click()"); page.wait_for_timeout(700)
    page.set_viewport_size({'width': 769, 'height': 900}); page.wait_for_timeout(1000)
    R['misc']['t769'] = page.evaluate(PROBE)
    # استخدام حقل على الديسكتوب بعد التحويل (قابلية الاستخدام)
    try:
        page.select_option('#shop-filter-category', index=1); page.wait_for_timeout(1900)
        R['misc']['t769_category_used'] = page.evaluate(PROBE)['count']
    except Exception as exc:
        R['misc']['t769_category_used'] = 'ERR:' + str(exc).split('\n')[0][:60]
    page.set_viewport_size({'width': 390, 'height': 900}); page.wait_for_timeout(900)
    R['misc']['back390'] = page.evaluate(PROBE)
    print('768→769: open=%s role=%s body=%s expanded=%s controlsUsable=%s | استخدام تصنيف ⇒ %s | back390 open=%s body=%s' % (
        R['misc']['t769']['open'], R['misc']['t769']['sheet']['role'], R['misc']['t769']['body'],
        R['misc']['t769']['expanded'], R['misc']['t769']['desktopControlsUsable'],
        R['misc']['t769_category_used'], R['misc']['back390']['open'], R['misc']['back390']['body']))
    ctx.close()

    # ===== C) الفلاتر الكاملة (بحث/تصنيف/علامة/ترتيب/سعر/عروض/تفريغ/ترقيم) =====
    ctx = b.new_context(viewport={'width': 1024, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140]}) if m.type == 'error' else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:140]}))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    products(page)
    # بحث داخل الأدوات
    reqs.clear()
    page.fill('#shop-filter-search', 'ثلاجة 500'); page.wait_for_timeout(2200)
    st = page.evaluate(PROBE)
    R['filters']['search_toolbar'] = {'cards': st['cards'], 'count': st['count'], 'hash': st['hash'], 'reqs': list(reqs)[:2]}
    print('search: cards=%s count=%s hash=%s' % (st['cards'], st['count'], st['hash']))
    # تصنيف/علامة/ترتيب عبر عناصر حقيقية
    for name, sel, idx in [('category', '#shop-filter-category', 1), ('brand', '#shop-filter-brand', 1), ('sort', '#shop-filter-sort', 2)]:
        reqs.clear()
        try:
            page.select_option(sel, index=idx); page.wait_for_timeout(2000)
            st = page.evaluate(PROBE)
            R['filters'][name] = {'cards': st['cards'], 'count': st['count'], 'hash': st['hash'], 'reqs': list(reqs)[:2]}
            print('%-8s cards=%s count=%s hash=%s' % (name, st['cards'], st['count'], st['hash']))
        except Exception as exc:
            R['filters'][name] = {'error': str(exc).split('\n')[0][:70]}
            print('%-8s ERR %s' % (name, str(exc).split('\n')[0][:60]))
    # عروض عبر العنصر الحقيقي
    reqs.clear()
    page.evaluate("document.getElementById('shop-filter-offers').click()"); page.wait_for_timeout(2000)
    st = page.evaluate(PROBE)
    R['filters']['offers'] = {'cards': st['cards'], 'count': st['count'], 'hash': st['hash'], 'reqs': list(reqs)[:2],
                              'inStockReq': any('inStock' in r for r in reqs)}
    print('offers: cards=%s count=%s hash=%s inStockReq=%s' % (st['cards'], st['count'], st['hash'], R['filters']['offers']['inStockReq']))
    # تفريغ الفلاتر
    try:
        page.click('#shop-view .shop-section__head .btn--ghost'); page.wait_for_timeout(2000)
        st = page.evaluate(PROBE)
        R['filters']['clear'] = {'cards': st['cards'], 'count': st['count'], 'hash': st['hash'], 'resetBtn': st['resetBtn']}
        print('clear: cards=%s count=%s hash=%s resetBtn=%s' % (st['cards'], st['count'], st['hash'], st['resetBtn']))
    except Exception as exc:
        R['filters']['clear'] = {'error': str(exc).split('\n')[0][:70]}
        print('clear ERR', str(exc).split('\n')[0][:60])
    # ?inStock=1 + hashes
    for name, h in [('instock1', '#/products?inStock=1'), ('instock_offers', '#/products?inStock=1&offers=1'),
                    ('instock_cat', '#/products?inStock=1&categoryId=293'), ('page2', '#/products?page=2'),
                    ('min99999', '#/products?minPrice=99999')]:
        reqs.clear()
        page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(2000)
        st = page.evaluate(PROBE)
        R['filters'][name] = {'cards': st['cards'], 'count': st['count'], 'hash': st['hash'],
                              'inStockReq': any('inStock' in r for r in reqs), 'overflow': st['overflow'], 'reqs': list(reqs)[:2]}
        print('%-14s cards=%s count=%-8s inStockReq=%s hash=%s ov=%s' % (name, st['cards'], st['count'], R['filters'][name]['inStockReq'], st['hash'], st['overflow']))
    ctx.close()

    # ===== D) داكن + انحدارات (Home/تصنيفات/علامات/بحث) =====
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140]}) if m.type == 'error' else None)
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
        products(page)
        R['matrix']['dark_%d' % w] = page.evaluate(PROBE)
        if w == 390:
            page.evaluate("document.getElementById('shop-filters-toggle').click()"); page.wait_for_timeout(800)
            R['sheet']['dark_open'] = page.evaluate(PROBE)
            page.screenshot(path=os.path.join(OUT, 'final-dark-sheet-390.png'))
            page.keyboard.press('Escape'); page.wait_for_timeout(600)
        ctx.close()

    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1600)
        R['misc']['home_%d' % w] = page.evaluate("""(() => { const q=s=>document.querySelector(s);
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height)}; };
          return {headerH: Math.round(q('.shop-header').getBoundingClientRect().height), homeCard: box(q('#shop-home-products .shop-card')||q('.shop-home .shop-card')),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()""")
        page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(1900)
        R['misc']['taxo_%d' % w] = page.evaluate(PROBE)['taxo']
        page.evaluate('location.hash = "#/products?view=brands"'); page.wait_for_timeout(1900)
        R['misc']['brands_%d' % w] = page.evaluate(PROBE)['taxo']
        if w == 390:
            page.evaluate('location.hash = "#/"'); page.wait_for_timeout(1800)
            page.click('#shop-search-btn'); page.wait_for_timeout(800)
            page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1600)
            R['misc']['search'] = page.evaluate("""(() => { const rows=Array.from(document.querySelectorAll('.shop-search-row'));
              return {rows: rows.length, rowH: rows[0]?Math.round(rows[0].getBoundingClientRect().height):null,
                top: Math.round(document.querySelector('.shop-search-sheet').getBoundingClientRect().y),
                overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()""")
            page.keyboard.press('Escape'); page.wait_for_timeout(600)
            page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(1900)
            page.screenshot(path=os.path.join(OUT, 'final-products-390.png'))
        else:
            page.screenshot(path=os.path.join(OUT, 'final-products-1366.png'))
        ctx.close()

    for w in (768, 769, 1024):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
        products(page)
        page.screenshot(path=os.path.join(OUT, 'final-products-%d.png' % w))
        ctx.close()

    b.close()

with open(os.path.join(OUT, 'final3g.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nconsole=%d failed=%d' % (len(R['console']), len(R['failed'])))
