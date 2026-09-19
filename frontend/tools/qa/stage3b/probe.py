"""PHASE 3 · STEP 3B — قياس قبل/بعد: إعادة Toolbar المنتجات إلى Desktop/Tablet.

الاستخدام: python3 probe.py before | after
قراءة فقط للتطبيق · تغييرات hash فقط · بلا كتابة بيانات.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3b'
os.makedirs(OUT, exist_ok=True)
R = {'mode': MODE, 'console': [], 'failed': [], 'shots': []}

WIDTHS = [360, 390, 430, 600, 640, 641, 700, 768, 769, 800, 900, 1023, 1024, 1280, 1366, 1440, 1920]

MEASURE = r"""(() => {
  const px = v => Math.round(v * 100) / 100;
  const vis = el => { if (!el) return false; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {x: px(b.x), y: px(b.y), w: px(b.width), h: px(b.height), top: px(b.top), bottom: px(b.bottom)}; };
  const C = (el, ps) => { if (!el) return null; const c = getComputedStyle(el); const o = {};
    ps.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const txt = el => el ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) : null;
  const tb = q('.shop-toolbar');
  const fields = qa('.shop-toolbar > .shop-toolbar__field');
  const count = q('.shop-toolbar__count');
  const controls = qa('.shop-toolbar input, .shop-toolbar select');
  // صفوف الشبكة: تجميع حسب y
  let rows = [];
  if (tb) { const ys = fields.map(f => Math.round(f.getBoundingClientRect().top));
    rows = ys.reduce((acc, y) => { if (!acc.length || Math.abs(acc[acc.length - 1] - y) > 8) acc.push(y); return acc; }, []); }
  const ids = ['shop-filter-search', 'shop-filter-category', 'shop-filter-brand', 'shop-filter-sort',
               'shop-filter-minprice', 'shop-filter-maxprice', 'shop-filter-instock', 'shop-filter-offers', 'shop-toolbar', 'shop-filters-toggle'];
  const dupIds = {};
  ids.forEach(id => { dupIds[id] = document.querySelectorAll('#' + id).length; });
  const firstCard = q('.shop-card');
  return {
    vw: window.innerWidth,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth,
    pageH: Math.round(document.documentElement.scrollHeight),
    headerH: q('.shop-header') ? px(q('.shop-header').getBoundingClientRect().height) : null,
    toolbar: tb ? {visible: vis(tb), rect: R(tb), css: C(tb, ['display', 'grid-template-columns', 'gap', 'padding', 'border-top-color', 'background-color', 'border-radius', 'margin-bottom'])} : null,
    toolbarRows: rows.length, rowYs: rows,
    fields: fields.map(f => ({label: txt(f.querySelector('.shop-toolbar__label')), rect: R(f), visible: vis(f)})),
    toggle: (() => { const t = q('.shop-filters__toggle'); return t ? {visible: vis(t), rect: R(t), display: getComputedStyle(t).display, expanded: t.getAttribute('aria-expanded'), controls: t.getAttribute('aria-controls')} : null; })(),
    sheet: (() => { const s = q('.shop-filters__sheet'); return s ? {visible: vis(s), display: getComputedStyle(s).display, position: getComputedStyle(s).position,
      transform: getComputedStyle(s).transform, rect: R(s), bg: getComputedStyle(s).backgroundColor,
      headVisible: vis(q('.shop-filters__sheet-head')), footVisible: vis(q('.shop-filters__sheet-foot'))} : null; })(),
    scrim: (() => { const s = q('.shop-filters__scrim'); return s ? {visible: vis(s), display: getComputedStyle(s).display} : null; })(),
    count: count ? {visible: vis(count), text: txt(count), rect: R(count)} : null,
    controls: controls.map(c => ({id: c.id, tag: c.tagName, type: c.getAttribute('type'), visible: vis(c), rect: R(c),
      h: c.getBoundingClientRect().height, css: C(c, ['height', 'min-height', 'font-size']), value: c.value, checked: c.checked})),
    controlsVisible: controls.filter(vis).length, controlsTotal: controls.length,
    checks: qa('.shop-check').map(l => ({text: txt(l), visible: vis(l), rect: R(l), minH: getComputedStyle(l).minHeight})),
    gridTop: q('.shop-grid') ? px(q('.shop-grid').getBoundingClientRect().top) : null,
    gridCols: q('.shop-grid') ? getComputedStyle(q('.shop-grid')).gridTemplateColumns : null,
    card: firstCard ? R(firstCard) : null,
    cardCount: qa('.shop-card').length,
    dupIds: dupIds,
    mainTop: q('#shop-main') ? px(q('#shop-main').getBoundingClientRect().top) : null
  };
})()"""


def shoot(page, name):
    p = os.path.join(OUT, '%s-%s.png' % (MODE, name))
    page.screenshot(path=p)
    R['shots'].append(p)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- A) مصفوفة العروض ----------
    for w in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:160], 'w': w}) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:160], 'w': w}))
        page.on('requestfailed', lambda r: R['failed'].append({'u': r.url[:110], 'r': str(r.failure)[:60], 'w': w}))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1700)
        d = page.evaluate(MEASURE)
        R['w%d' % w] = d
        print('%-5d toolbar=%-5s rows=%d h=%-7s toggle=%-5s sheet=%-8s controls=%-2d/%-2d count=%-5s gridTop=%-7s pageH=%-6s ov=%s' % (
            w, d['toolbar'] and d['toolbar']['visible'], d['toolbarRows'],
            d['toolbar'] and round(d['toolbar']['rect']['h']), d['toggle'] and d['toggle']['visible'],
            d['sheet'] and d['sheet']['display'], d['controlsVisible'], d['controlsTotal'],
            d['count'] and d['count']['visible'], d['gridTop'], d['pageH'], d['docOverflow']))
        if w in (768, 769, 900, 1024, 1366):
            shoot(page, 'products-%d' % w)
        ctx.close()

    # ---------- B) فتح اللوحة على الجوال (390 و 768) ----------
    for w in (390, 768):
        ctx = b.new_context(viewport={'width': w, 'height': 844}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1700)
        opened = False
        try:
            page.click('#shop-filters-toggle', timeout=4000)
            page.wait_for_timeout(700)
            opened = True
        except Exception as exc:
            R['open_fail_%d' % w] = str(exc)[:120]
        R['open%d' % w] = page.evaluate(MEASURE)
        R['open%d' % w]['opened'] = opened
        shoot(page, 'filters-open-%d' % w)
        print('open %d: clicked=%s open=%s sheetRect=%s' % (w, opened, R['open%d' % w]['sheet'] and R['open%d' % w]['sheet']['rect']['h'],
              R['open%d' % w]['sheet'] and R['open%d' % w]['sheet']['rect']['top']))
        ctx.close()

    # ---------- C) وظائف الديسكتوب: كل عنصر تحكم + عدد الطلبات ----------
    for w in (1024, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        reqs = []
        page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1800)
        J = {}

        def step(label, fn):
            reqs.clear()
            hash_before = page.evaluate('location.hash')
            try:
                fn()
            except Exception as exc:
                J[label] = {'error': str(exc)[:110]}
                print('  %s ERROR %s' % (label, str(exc)[:80]))
                return
            page.wait_for_timeout(1800)
            J[label] = {'hash_before': hash_before, 'hash_after': page.evaluate('location.hash'),
                        'changed': hash_before != page.evaluate('location.hash'),
                        'requests': list(reqs), 'cards': page.evaluate("document.querySelectorAll('.shop-card').length"),
                        'count': page.evaluate("(document.querySelector('.shop-toolbar__count')||{}).textContent")}
            print('  %-14s changed=%-5s reqs=%s cards=%s' % (label, J[label]['changed'], J[label]['requests'], J[label]['cards']))

        step('search', lambda: (page.fill('#shop-filter-search', 'ثلاجة'), page.keyboard.press('Enter')))
        step('category', lambda: page.select_option('#shop-filter-category', '293'))
        step('brand', lambda: page.select_option('#shop-filter-brand', '254'))
        step('sort', lambda: page.select_option('#shop-filter-sort', 'price:asc'))
        step('price', lambda: (page.fill('#shop-filter-minprice', '400'), page.dispatch_event('#shop-filter-minprice', 'change')))
        step('instock', lambda: page.check('#shop-filter-instock'))
        step('offers', lambda: page.check('#shop-filter-offers'))
        step('reset', lambda: page.evaluate("""(() => { const b = document.querySelector('.shop-section__head .btn'); if (b) b.click(); })()"""))
        R['journey%d' % w] = J
        shoot(page, 'toolbar-interaction-%d' % w)
        ctx.close()

    # ---------- D) 1366 داكن + نتائج تصنيف/علامة ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1300)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1700)
    R['dark1366'] = page.evaluate(MEASURE)
    shoot(page, 'products-1366-dark')
    print('dark 1366: toolbar visible=%s bg=%s border=%s' % (R['dark1366']['toolbar']['visible'],
          R['dark1366']['toolbar']['css']['background-color'], R['dark1366']['toolbar']['css']['border-top-color']))
    ctx.close()

    for label, h in [('category-result-1024', '#/products?categoryId=293'), ('brand-result-1024', '#/products?brandId=254')]:
        w = 1024
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        page.evaluate('location.hash = "%s"' % h)
        page.wait_for_timeout(1700)
        R[label] = page.evaluate(MEASURE)
        shoot(page, label)
        print('%s: toolbar=%s controls=%d count=%s' % (label, R[label]['toolbar']['visible'], R[label]['controlsVisible'],
              R[label]['count'] and R[label]['count']['text']))
        ctx.close()

    # ---------- E) انحدار: 390 جوال (هيدر/قائمة/بحث/Home/بطاقات) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1900)
    R['reg390'] = page.evaluate("""(() => { const q = s => document.querySelector(s);
      const R2 = el => { const b = el.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top)}; };
      const card = q('#shop-view .shop-card');
      return {homeCards: document.querySelectorAll('#shop-view .shop-card').length, hero: !!q('.shop-home-slider, .shop-hero'),
        headerH: Math.round(q('.shop-header').getBoundingClientRect().height), logo: R2(q('.shop-brand__logo')), burger: R2(q('#shop-burger')),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        homeCard: card ? R2(card) : null}; })()""")
    shoot(page, 'home-390')
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1700)
    R['reg390']['listingCard'] = page.evaluate("""(() => { const b = document.querySelector('.shop-card').getBoundingClientRect();
      return {w: Math.round(b.width), h: Math.round(b.height)}; })()""")
    page.click('#shop-search-btn')
    page.wait_for_timeout(1200)
    R['reg390']['searchSheet'] = page.evaluate("""(() => { const s = document.getElementById('shop-search-sheet');
      return {top: Math.round(s.getBoundingClientRect().top), bg: getComputedStyle(s).backgroundColor}; })()""")
    shoot(page, 'search-390')
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.click('#shop-burger')
    page.wait_for_timeout(800)
    R['reg390']['menu'] = page.evaluate("""(() => ({rowH: Math.round(document.querySelector('.shop-drawer__link').getBoundingClientRect().height),
      drawerTop: Math.round(document.getElementById('shop-drawer').getBoundingClientRect().top)}))()""")
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)
    print('reg390:', json.dumps(R['reg390'], ensure_ascii=False))
    ctx.close()

    # ---------- F) انحدار: ديسكتوب هيدر 1366 ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1700)
    R['reg1366'] = page.evaluate("""(() => ({headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      navLinkH: Math.round(document.querySelector('.shop-nav__link').getBoundingClientRect().height)}))()""")
    print('reg1366:', R['reg1366'])
    ctx.close()
    b.close()

with open(os.path.join(OUT, 'probe-%s.json' % MODE), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n%s: console=%d failed=%d shots=%d' % (MODE, len(R['console']), len(R['failed']), len(R['shots'])))
