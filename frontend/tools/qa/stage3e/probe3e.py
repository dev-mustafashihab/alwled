"""PHASE 3 · STEP 3E — قبل/بعد: تجربة التصنيفات والعلامات.

الاستخدام: python3 probe3e.py before | after
قراءة فقط · تغييرات DOM داخل جلسة الفحص فقط للاختبارات (اسم طويل) · بلا كتابة بيانات.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3e'
os.makedirs(OUT, exist_ok=True)
R = {'mode': MODE, 'console': [], 'failed': [], 'shots': []}

WIDTHS = [360, 390, 430, 600, 768, 769, 900, 1024, 1280, 1366, 1440, 1920]

MEASURE = r"""(() => {
  const px = v => Math.round(v * 100) / 100;
  const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {x: px(b.x), y: px(b.y), w: px(b.width), h: px(b.height), top: px(b.top), bottom: px(b.bottom)}; };
  const C = (el, ps) => { if (!el) return null; const c = getComputedStyle(el); const o = {};
    ps.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const txt = el => el ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) : null;
  const view = q('#shop-view');
  const cont = q('.shop-container');
  const head = q('#shop-view > .shop-section__head');
  const grid = q('#shop-view > .shop-taxonomy');
  const items = qa('#shop-view > .shop-taxonomy > .shop-taxonomy__item');
  const footer = q('.shop-footer') || q('footer');
  const vb = view ? view.getBoundingClientRect() : null;
  return {
    vw: window.innerWidth,
    hash: location.hash,
    theme: document.documentElement.getAttribute('data-theme'),
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docH: Math.round(document.documentElement.scrollHeight),
    container: cont ? {rect: R(cont), css: C(cont, ['max-width', 'padding-inline-start', 'padding-inline-end'])} : null,
    view: vb ? {rect: R(view), css: C(view, ['padding-inline-start', 'padding-inline-end', 'max-width'])} : null,
    crumb: (() => { const c = q('.shop-crumbs'); return c ? {text: txt(c), rect: R(c), css: C(c, ['font-size', 'margin-bottom'])} : null; })(),
    head: head ? {rect: R(head), css: C(head, ['margin', 'margin-bottom', 'display', 'align-items', 'justify-content']),
      h1: txt(head.querySelector('h1')), h1Css: C(head.querySelector('h1'), ['font-size', 'font-weight', 'color']),
      h1Rect: R(head.querySelector('h1')),
      sub: txt(head.querySelector('.shop-section__sub')), subCss: C(head.querySelector('.shop-section__sub'), ['font-size', 'color', 'max-width', 'margin']),
      subRect: R(head.querySelector('.shop-section__sub'))} : null,
    grid: grid ? {rect: R(grid), css: C(grid, ['display', 'grid-template-columns', 'gap', 'justify-content', 'overflow-x', 'margin', 'padding', 'width', 'max-width']),
      cols: getComputedStyle(grid).gridTemplateColumns, scrollW: grid.scrollWidth, clientW: grid.clientWidth} : null,
    itemsCount: items.length,
    items: items.map((it, i) => ({
      i: i, text: txt(it), href: it.getAttribute('href'), rect: R(it),
      css: C(it, ['display', 'flex-direction', 'align-items', 'justify-content', 'gap', 'padding', 'min-height', 'border-radius',
        'background-color', 'border-top-color', 'overflow', 'flex', 'min-width', 'max-width', 'text-decoration-line', 'transition']),
      name: txt(it.querySelector('.shop-taxonomy__name')),
      nameRect: R(it.querySelector('.shop-taxonomy__name')),
      nameCss: C(it.querySelector('.shop-taxonomy__name'), ['font-size', 'font-weight', 'line-height', 'color', 'display',
        '-webkit-line-clamp', 'overflow', 'overflow-wrap', 'word-break', 'min-width']),
      count: txt(it.querySelector('.shop-taxonomy__count')),
      countRect: R(it.querySelector('.shop-taxonomy__count')),
      countCss: C(it.querySelector('.shop-taxonomy__count'), ['font-size', 'color', 'white-space', 'line-height']),
      note: txt(it.querySelector('.shop-note')),
      hasIcon: !!it.querySelector('.shop-taxonomy__icon')
    })),
    introToGridGap: (head && grid) ? px(grid.getBoundingClientRect().top - head.getBoundingClientRect().bottom) : null,
    gridToFooterGap: (grid && footer) ? px(footer.getBoundingClientRect().top - grid.getBoundingClientRect().bottom) : null,
    footerTop: footer ? px(footer.getBoundingClientRect().top) : null,
    bodyH: Math.round(document.body.getBoundingClientRect().height),
    headerH: q('.shop-header') ? px(q('.shop-header').getBoundingClientRect().height) : null,
    state: (() => { const s = q('#shop-view > .state'); return s ? {cls: s.className, rect: R(s),
      title: txt(s.querySelector('.state__title')), text: txt(s.querySelector('.state__text'))} : null; })(),
    skeletons: qa('.skeleton').length
  };
})()"""


def shoot(page, name):
    p = os.path.join(OUT, '%s-%s.png' % (MODE, name))
    page.screenshot(path=p)
    R['shots'].append(p)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- A) مصفوفة العروض × (تصنيفات/علامات) ----------
    for kind, hash_ in [('categories', '#/products?view=categories'), ('brands', '#/products?view=brands')]:
        for w in WIDTHS:
            ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
            page = ctx.new_page()
            page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140], 'k': kind, 'w': w}) if m.type in ('error', 'warning') else None)
            page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:140]}))
            page.on('requestfailed', lambda r: R['failed'].append({'u': r.url[:110], 'r': str(r.failure)[:50]}))
            page.goto(SHOP, wait_until='load')
            page.wait_for_timeout(1300)
            page.evaluate('location.hash = "%s"' % hash_)
            page.wait_for_timeout(1700)
            d = page.evaluate(MEASURE)
            R['%s_%d' % (kind, w)] = d
            it0 = d['items'][0] if d['items'] else None
            it1 = d['items'][1] if len(d['items']) > 1 else None
            print('%-10s %-5d ov=%-2s gridW=%-7s cols=%-26s card0=%sx%s x=%s | card1 x=%s w=%s | gapI-G=%s | docH=%s' % (
                kind, w, d['docOverflow'], d['grid'] and round(d['grid']['rect']['w']), (d['grid'] or {}).get('cols'),
                it0 and round(it0['rect']['w']), it0 and round(it0['rect']['h']), it0 and round(it0['rect']['x']),
                it1 and round(it1['rect']['x']), it1 and round(it1['rect']['w']), d['introToGridGap'], d['docH']))
            if w in (390, 768, 1024, 1366, 1920):
                shoot(page, '%s-%d' % (kind, w))
            ctx.close()

    # ---------- B) الثيم الداكن ----------
    for kind, hash_ in [('categories', '#/products?view=categories'), ('brands', '#/products?view=brands')]:
        for w in (390, 1366):
            ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
            page = ctx.new_page()
            page.goto(SHOP, wait_until='load')
            page.wait_for_timeout(1300)
            page.evaluate('location.hash = "%s"' % hash_)
            page.wait_for_timeout(1700)
            R['dark_%s_%d' % (kind, w)] = page.evaluate(MEASURE)
            shoot(page, 'dark-%s-%d' % (kind, w))
            d = R['dark_%s_%d' % (kind, w)]
            print('dark %-10s %-5d card=%s bg=%s border=%s' % (kind, w, d['items'] and (round(d['items'][0]['rect']['w']), round(d['items'][0]['rect']['h'])),
                  d['items'] and d['items'][0]['css']['background-color'], d['items'] and d['items'][0]['css']['border-top-color']))
            ctx.close()

    # ---------- C) اسم طويل + عدّاد صفر + تركيز لوحة المفاتيح (جلسة الفحص فقط) ----------
    for w in (360, 390, 1024, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        page.evaluate('location.hash = "#/products?view=categories"')
        page.wait_for_timeout(1700)
        # تغيير نص داخل جلسة الفحص فقط (لا تعديل للتطبيق)
        page.evaluate("""(() => { const items = document.querySelectorAll('#shop-view > .shop-taxonomy > .shop-taxonomy__item');
          if (items[0]) { const n = items[0].querySelector('.shop-taxonomy__name'); if (n) n.textContent = 'تصنيف تجريبي طويل جدًا لاختبار الالتفاف والقص في الواجهة العربية للأجهزة المنزلية الكهربائية المنزلية'; }
          if (items[1]) { const n = items[1].querySelector('.shop-taxonomy__name'); if (n) n.textContent = 'علامة طويلة بلا مسافات طويلة جدًا للاختبار'; } })()""")
        page.wait_for_timeout(400)
        R['longname_%d' % w] = page.evaluate(MEASURE)
        shoot(page, 'longname-%d' % w)
        d = R['longname_%d' % w]
        print('longname %-5d card0 h=%s | name lines? rect=%s | ov=%s' % (w, d['items'] and round(d['items'][0]['rect']['h']),
              d['items'] and d['items'][0]['nameRect'], d['docOverflow']))
        # تركيز لوحة المفاتيح على البطاقة
        for _ in range(22):
            page.keyboard.press('Tab')
            page.wait_for_timeout(90)
            if page.evaluate("document.activeElement && document.activeElement.classList.contains('shop-taxonomy__item')"):
                break
        R['focus_%d' % w] = page.evaluate("""(() => { const a=document.activeElement; if(!a) return null; const cs=getComputedStyle(a);
          return {cls:a.className, outline: cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor, shadow: cs.boxShadow.slice(0,44), border: cs.borderTopColor}; })()""")
        shoot(page, 'focus-%d' % w)
        print('focus %-5d %s' % (w, R['focus_%d' % w]))
        ctx.close()

    # ---------- D) الحالة الفارغة (mock في جلسة الفحص) + الخطأ ----------
    for label, route_glob, body in [
        ('empty_categories', '**/categories*', '{"success":true,"message":"Success","data":{"items":[],"meta":{"total":0}}}'),
        ('empty_brands', '**/brands*', '{"success":true,"message":"Success","data":{"items":[],"meta":{"total":0}}}')]:
        ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        def make_mock(payload):
            def handler(route, request):
                route.fulfill(status=200, content_type='application/json', body=payload)
            return handler
        page.route(route_glob, make_mock(body))
        page.evaluate('location.hash = "%s"' % ('#/products?view=categories' if 'categories' in label else '#/products?view=brands'))
        page.wait_for_timeout(1900)
        R[label] = page.evaluate(MEASURE)
        shoot(page, label)
        print('%-18s state=%s' % (label, R[label]['state']))
        ctx.close()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1300)
    page.route('**/categories*', lambda r: r.abort())
    page.evaluate('location.hash = "#/products?view=categories"')
    page.wait_for_timeout(2000)
    R['error_categories'] = page.evaluate(MEASURE)
    shoot(page, 'error_categories')
    print('error_categories state=%s' % R['error_categories']['state'])
    ctx.close()

    # ---------- E) تحميل ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1300)
    page.route('**/categories*', lambda route: None)
    page.evaluate('location.hash = "#/products?view=categories"')
    page.wait_for_timeout(1400)
    R['loading_1366'] = page.evaluate(MEASURE)
    shoot(page, 'loading-1366')
    print('loading: skeletons=%s' % R['loading_1366']['skeletons'])
    ctx.close()

    # ---------- F) الطلبات (عدد) ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1800)
    R['net_home'] = list(reqs); reqs.clear()
    page.evaluate('location.hash = "#/products?view=categories"')
    page.wait_for_timeout(1800)
    R['net_categories'] = list(reqs); reqs.clear()
    page.evaluate('location.hash = "#/products?view=brands"')
    page.wait_for_timeout(1800)
    R['net_brands'] = list(reqs); reqs.clear()
    print('net: home=%s | categories=%s | brands=%s' % (R['net_home'], R['net_categories'], R['net_brands']))
    ctx.close()

    # ---------- G) انحدار: Home / Products / بطاقة المنتج / 3F داكن ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1900)
    R['reg_home_390'] = page.evaluate("""(() => { const q=s=>document.querySelector(s);
      const hc = q('#shop-home-categories .shop-taxonomy');
      const hcItem = q('#shop-home-categories .shop-taxonomy__item');
      const R2 = el => { if(!el) return null; const b=el.getBoundingClientRect(); return {w:Math.round(b.width), h:Math.round(b.height), x:Math.round(b.x)}; };
      return {hero: !!q('.shop-home-slider, .shop-hero'), homeCards: document.querySelectorAll('#shop-view .shop-card').length,
        homeTaxoItems: document.querySelectorAll('#shop-home-categories .shop-taxonomy__item').length,
        homeTaxo: R2(hc), homeTaxoItem: R2(hcItem), homeTaxoDisplay: hc?getComputedStyle(hc).display:null,
        homeTaxoCols: hc?getComputedStyle(hc).gridTemplateColumns:null,
        homeTaxoIcon: !!q('#shop-home-categories .shop-taxonomy__icon'),
        headerH: Math.round(q('.shop-header').getBoundingClientRect().height),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()""")
    shoot(page, 'home-390')
    print('reg_home_390:', json.dumps(R['reg_home_390'], ensure_ascii=False))
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    R['reg_products_390'] = page.evaluate("""(() => ({card: (() => { const b=document.querySelector('.shop-card').getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height)}; })(),
      toolbarH: Math.round(document.querySelector('.shop-toolbar').getBoundingClientRect().height),
      toggle: !!document.querySelector('#shop-filters-toggle'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    print('reg_products_390:', R['reg_products_390'])
    ctx.close()

    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    R['reg_products_1366'] = page.evaluate("""(() => { const tb=document.querySelector('.shop-toolbar');
      const fields=Array.from(document.querySelectorAll('.shop-toolbar > .shop-toolbar__field'));
      const ys=fields.map(f=>Math.round(f.getBoundingClientRect().top));
      const rows=ys.reduce((a,y)=>{ if(!a.length||Math.abs(a[a.length-1]-y)>8) a.push(y); return a; },[]);
      return {toolbarH: Math.round(tb.getBoundingClientRect().height), rows: rows.length, cols: getComputedStyle(tb).gridTemplateColumns,
        card: (()=>{const b=document.querySelector('.shop-card').getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height)};})(),
        headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()""")
    print('reg_products_1366:', R['reg_products_1366'])
    page.evaluate('location.hash = "#/products?minPrice=400"')
    page.wait_for_timeout(1800)
    R['reg_price'] = page.evaluate("""(() => ({cards: document.querySelectorAll('.shop-card').length,
      count: (document.querySelector('.shop-toolbar__count')||{}).textContent}))()""")
    page.evaluate('location.hash = "#/products?offers=1"')
    page.wait_for_timeout(1800)
    R['reg_offers'] = page.evaluate("document.querySelectorAll('.shop-card').length")
    page.evaluate('location.hash = "#/products?page=2"')
    page.wait_for_timeout(1900)
    R['reg_page2'] = page.evaluate("({hash: location.hash, cards: document.querySelectorAll('.shop-card').length})")
    print('reg price/offers/page2:', R['reg_price'], R['reg_offers'], R['reg_page2'])
    ctx.close()

    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(800)
    R['reg_dark_sheet'] = page.evaluate("""(() => { const s=document.querySelector('.shop-filters__sheet');
      const c=document.querySelector('.shop-check'); return {sheetBg:getComputedStyle(s).backgroundColor,
      checkBg:getComputedStyle(c).backgroundColor, open:!!document.querySelector('.shop-filters.is-open')}; })()""")
    print('reg_dark_sheet:', R['reg_dark_sheet'])
    ctx.close()
    b.close()

with open(os.path.join(OUT, 'probe3e-%s.json' % MODE), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n%s: console=%d failed=%d shots=%d' % (MODE, len(R['console']), len(R['failed']), len(R['shots'])))
