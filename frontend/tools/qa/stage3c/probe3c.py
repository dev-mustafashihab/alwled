"""PHASE 3 · STEP 3C — قبل/بعد: صحة الفلاتر وتناسق الاستعلام.

الاستخدام: python3 probe3c.py before | after
قراءة فقط للتطبيق · تغييرات hash فقط · بلا كتابة بيانات.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3c'
os.makedirs(OUT, exist_ok=True)
R = {'mode': MODE, 'console': [], 'failed': [], 'shots': []}

SCEN = [
    ('none', '#/products'),
    ('minPrice_400', '#/products?minPrice=400'),
    ('maxPrice_400', '#/products?maxPrice=400'),
    ('range_400_550', '#/products?minPrice=400&maxPrice=550'),
    ('minPrice_99999', '#/products?minPrice=99999'),
    ('maxPrice_1', '#/products?maxPrice=1'),
    ('minPrice_0', '#/products?minPrice=0'),
    ('maxPrice_0', '#/products?maxPrice=0'),
    ('empty_values', '#/products?minPrice=&maxPrice='),
    ('malformed', '#/products?minPrice=abc'),
    ('negative', '#/products?minPrice=-5'),
    ('decimal', '#/products?minPrice=350.5'),
    ('invalid_range', '#/products?minPrice=600&maxPrice=100'),
    ('offers_1', '#/products?offers=1'),
    ('instock_1', '#/products?inStock=1'),
    ('cat_brand', '#/products?categoryId=293&brandId=254'),
    ('brand_minPrice', '#/products?brandId=254&minPrice=400'),
    ('search_maxPrice', '#/products?search=%D8%AB%D9%84%D8%A7%D8%AC%D8%A9&maxPrice=400'),
    ('offers_minPrice', '#/products?offers=1&minPrice=400'),
    ('instock_brand', '#/products?inStock=1&brandId=254'),
    ('page_2', '#/products?page=2'),
    ('page_3', '#/products?page=3'),
]

SNAP = r"""(() => {
  const px = v => Math.round(v * 100) / 100;
  const q = s => document.querySelector(s);
  const cnt = q('.shop-toolbar__count');
  const state = q('.state');
  return {
    hash: location.hash,
    cards: document.querySelectorAll('.shop-card').length,
    count: cnt ? (cnt.textContent || '').trim() : null,
    empty: !!q('.state--empty'), stateTitle: q('.state__title') ? (q('.state__title').textContent || '').trim() : null,
    page: (() => { const m = /[?&]page=(\d+)/.exec(location.hash); return m ? Number(m[1]) : null; })(),
    inputs: {min: q('#shop-filter-minprice') ? q('#shop-filter-minprice').value : null,
             max: q('#shop-filter-maxprice') ? q('#shop-filter-maxprice').value : null,
             search: q('#shop-filter-search') ? q('#shop-filter-search').value : null,
             cat: q('#shop-filter-category') ? q('#shop-filter-category').value : null,
             brand: q('#shop-filter-brand') ? q('#shop-filter-brand').value : null,
             offers: q('#shop-filter-offers') ? q('#shop-filter-offers').checked : null,
             instock: q('#shop-filter-instock') ? q('#shop-filter-instock').checked : null},
    pagination: !!q('.pagination'),
    headClear: !!document.querySelector('.shop-section__head .btn'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
})()"""


def shoot(page, name):
    p = os.path.join(OUT, '%s-%s.png' % (MODE, name))
    page.screenshot(path=p)
    R['shots'].append(p)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- A) السيناريوهات على 1366 مع تسجيل الطلبات والردود ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:170], 's': 'scen'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:170], 's': 'scen'}))
    page.on('requestfailed', lambda r: R['failed'].append({'u': r.url[:120], 'r': str(r.failure)[:60]}))
    reqs = []
    resps = []

    def on_req(r):
        if '/api/v1/' in r.url:
            reqs.append(r.url.split('/api/v1/')[-1])

    def on_resp(r):
        if '/api/v1/products' in r.url:
            try:
                body = r.json()
                data = body.get('data') if isinstance(body, dict) else None
                resps.append({'url': r.url.split('/api/v1/')[-1], 'status': r.status,
                              'total': (data or {}).get('meta', {}).get('total') if data else None,
                              'items': len((data or {}).get('items', [])) if data else None,
                              'itemKeys': sorted((data or {}).get('items', [{}])[0].keys()) if data and (data or {}).get('items') else None})
            except Exception:
                resps.append({'url': r.url.split('/api/v1/')[-1], 'status': r.status, 'parse': 'fail'})

    page.on('request', on_req)
    page.on('response', on_resp)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    scen = {}
    for label, hash_ in SCEN:
        reqs.clear()
        resps.clear()
        page.evaluate('location.hash = "%s"' % hash_)
        page.wait_for_timeout(1900)
        snap = page.evaluate(SNAP)
        snap['requests'] = list(reqs)
        snap['productResponses'] = list(resps)
        scen[label] = snap
        print('%-16s hash=%-42s req=%-64s cards=%s total=%s count=%s empty=%s' % (
            label, snap['hash'][:42], (snap['requests'][0] if snap['requests'] else '-')[:64], snap['cards'],
            (snap['productResponses'][0]['total'] if snap['productResponses'] else '-'), snap['count'], snap['empty']))
    R['scenarios'] = scen

    # ---------- B) تفاعل: إعادة تعيين الصفحة + reload + back/forward ----------
    reqs.clear()
    page.evaluate('location.hash = "#/products?page=1"')
    page.wait_for_timeout(1600)
    J = {}
    J['start'] = page.evaluate(SNAP)
    page.select_option('#shop-filter-category', '293')
    page.wait_for_timeout(1900)
    J['after_category'] = page.evaluate(SNAP)
    page.fill('#shop-filter-minprice', '400')
    page.dispatch_event('#shop-filter-minprice', 'change')
    page.wait_for_timeout(1900)
    J['after_minPrice'] = page.evaluate(SNAP)
    print('reload/back-forward: start=%s after_category=%s after_min=%s' % (
        J['start']['hash'], J['after_category']['hash'], J['after_minPrice']['hash']))
    page.reload(wait_until='load')
    page.wait_for_timeout(2400)
    J['after_reload'] = page.evaluate(SNAP)
    page.go_back()
    page.wait_for_timeout(2000)
    J['after_back'] = page.evaluate(SNAP)
    page.go_forward()
    page.wait_for_timeout(2000)
    J['after_forward'] = page.evaluate(SNAP)
    R['journey'] = J
    print('  reload=%s back=%s forward=%s' % (J['after_reload']['hash'], J['after_back']['hash'], J['after_forward']['hash']))

    # ---------- C) التفاعل من الواجهة (كل عنصر تحكم) على 1366 ----------
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    UI = {}
    for label, fn in [
        ('search', lambda: (page.fill('#shop-filter-search', 'ثلاجة'), page.keyboard.press('Enter'))),
        ('category', lambda: page.select_option('#shop-filter-category', '293')),
        ('brand', lambda: page.select_option('#shop-filter-brand', '254')),
        ('sort', lambda: page.select_option('#shop-filter-sort', 'price:asc')),
        ('minPrice_ui', lambda: (page.fill('#shop-filter-minprice', '400'), page.dispatch_event('#shop-filter-minprice', 'change'))),
        ('maxPrice_ui', lambda: (page.fill('#shop-filter-maxprice', '500'), page.dispatch_event('#shop-filter-maxprice', 'change'))),
        ('instock_ui', lambda: page.check('#shop-filter-instock')),
        ('offers_ui', lambda: page.check('#shop-filter-offers')),
        ('reset', lambda: page.evaluate("(() => { const b=document.querySelector('.shop-section__head .btn'); if (b) b.click(); })()")),
    ]:
        reqs.clear()
        resps.clear()
        try:
            fn()
        except Exception as exc:
            UI[label] = {'error': str(exc).split('\n')[0][:90]}
            print('  ui %-11s ERROR' % label)
            continue
        page.wait_for_timeout(1900)
        snap = page.evaluate(SNAP)
        snap['requests'] = list(reqs)
        snap['productResponses'] = list(resps)
        UI[label] = snap
        print('  ui %-11s hash=%-46s req=%-52s cards=%s count=%s' % (label, snap['hash'][:46],
              (snap['requests'][0] if snap['requests'] else '-')[:52], snap['cards'], snap['count']))
    R['ui'] = UI
    shoot(page, 'ui-end-1366')
    ctx.close()

    # ---------- D) parity: نفس hash على 390/1024/1366 ----------
    par = {}
    for hash_ in ['#/products?minPrice=400', '#/products?maxPrice=400', '#/products?offers=1', '#/products?page=2']:
        par[hash_] = {}
        for w in (390, 1024, 1366):
            c2 = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
            p2 = c2.new_page()
            p2.goto(SHOP, wait_until='load')
            p2.wait_for_timeout(1400)
            p2.evaluate('location.hash = "%s"' % hash_)
            p2.wait_for_timeout(1900)
            s = p2.evaluate(SNAP)
            s['hashAfter'] = p2.evaluate('location.hash')
            par[hash_]['w%d' % w] = {'cards': s['cards'], 'count': s['count'], 'empty': s['empty'], 'hashAfter': s['hashAfter'], 'overflow': s['overflow']}
            c2.close()
        print('parity %-30s %s' % (hash_, par[hash_]))
    R['parity'] = par

    # ---------- E) انحدار 3B + Header/Home/Menu/Search/Cards ----------
    reg = {}
    for w in (390, 768, 769, 1024, 1366):
        c3 = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        p3 = c3.new_page()
        p3.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 's': 'reg%d' % w}) if m.type == 'error' else None)
        p3.goto(SHOP, wait_until='load')
        p3.wait_for_timeout(1400)
        p3.evaluate('location.hash = "#/products"')
        p3.wait_for_timeout(1800)
        reg['w%d' % w] = p3.evaluate(r"""(() => {
          const vis = e => { if (!e) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).display !== 'none'; };
          const tb = document.querySelector('.shop-toolbar'), t = document.getElementById('shop-filters-toggle');
          const sh = document.querySelector('.shop-filters__sheet');
          const card = document.querySelector('.shop-card');
          const cs = tb ? getComputedStyle(tb) : null;
          const fields = Array.from(document.querySelectorAll('.shop-toolbar > .shop-toolbar__field'));
          const ys = fields.map(f => Math.round(f.getBoundingClientRect().top));
          const rows = ys.reduce((a, y) => { if (!a.length || Math.abs(a[a.length - 1] - y) > 8) a.push(y); return a; }, []);
          return {toolbarVisible: vis(tb), sheetDisplay: sh ? getComputedStyle(sh).display : null, toggleVisible: vis(t),
            toolbarRows: rows.length, toolbarH: tb ? Math.round(tb.getBoundingClientRect().height) : 0,
            cols: cs ? cs.gridTemplateColumns : null,
            controlsVisible: Array.from(document.querySelectorAll('.shop-toolbar input, .shop-toolbar select')).filter(vis).length,
            countVisible: vis(document.querySelector('.shop-toolbar__count')),
            card: card ? {w: Math.round(card.getBoundingClientRect().width), h: Math.round(card.getBoundingClientRect().height)} : null,
            headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()""")
        print('reg %d: %s' % (w, json.dumps(reg['w%d' % w], ensure_ascii=False)))
        c3.close()
    R['reg'] = reg

    # 390: home + menu + search + cards
    c4 = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    p4 = c4.new_page()
    p4.goto(SHOP, wait_until='load')
    p4.wait_for_timeout(1900)
    R['reg390home'] = p4.evaluate("""(() => ({homeCards: document.querySelectorAll('#shop-view .shop-card').length,
      hero: !!document.querySelector('.shop-home-slider, .shop-hero'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    p4.evaluate('location.hash = "#/products"')
    p4.wait_for_timeout(1700)
    R['reg390home']['listingCard'] = p4.evaluate("""(() => { const b = document.querySelector('.shop-card').getBoundingClientRect();
      return {w: Math.round(b.width), h: Math.round(b.height)}; })()""")
    p4.click('#shop-search-btn')
    p4.wait_for_timeout(1100)
    R['reg390home']['searchSheet'] = p4.evaluate("""(() => { const s = document.getElementById('shop-search-sheet');
      return {top: Math.round(s.getBoundingClientRect().top), bg: getComputedStyle(s).backgroundColor}; })()""")
    p4.keyboard.press('Escape')
    p4.wait_for_timeout(400)
    p4.click('#shop-burger')
    p4.wait_for_timeout(700)
    R['reg390home']['menu'] = p4.evaluate("""(() => ({rowH: Math.round(document.querySelector('.shop-drawer__link').getBoundingClientRect().height),
      drawerTop: Math.round(document.getElementById('shop-drawer').getBoundingClientRect().top)}))()""")
    print('reg390home:', json.dumps(R['reg390home'], ensure_ascii=False))
    c4.close()
    b.close()

with open(os.path.join(OUT, 'probe3c-%s.json' % MODE), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n%s: console=%d failed=%d' % (MODE, len(R['console']), len(R['failed'])))
