"""PHASE 3 · STEP 3G — مصفوفة responsive + انحدارات (قراءة فقط).

الاستخدام: python3 matrix3g.py after
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'after'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3g'
WIDTHS = [360, 390, 430, 600, 640, 641, 768, 769, 900, 1023, 1024, 1280, 1366, 1440, 1920]
R = {'mode': MODE, 'matrix': {}, 'regression': {}, 'requests': {}, 'console': [], 'shots': []}

MATRIX_JS = r"""(() => {
  const q = s => document.querySelector(s);
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.y)}; };
  const header = q('.shop-header');
  const toolbar = q('.shop-toolbar');
  const toggle = q('#shop-filters-toggle');
  const sheet = q('.shop-filters__sheet');
  const card = q('#shop-view > .shop-grid .shop-card');
  const taxo = q('#shop-view > .shop-taxonomy > .shop-taxonomy__item');
  const grid = q('#shop-view > .shop-grid');
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  const tcols = (() => { const t = q('#shop-view > .shop-taxonomy'); if (!t) return 0;
    return getComputedStyle(t).gridTemplateColumns.split(' ').filter(Boolean).length; })();
  return {
    vw: window.innerWidth,
    headerH: header ? Math.round(header.getBoundingClientRect().height) : null,
    headerSticky: header ? getComputedStyle(header).position : null,
    toolbarVisible: toolbar ? toolbar.getBoundingClientRect().height > 0 : null,
    toolbarH: box(toolbar) ? box(toolbar).h : null,
    toolbarMode: toolbar && toolbar.getBoundingClientRect().height > 0 ? 'inline' : 'sheet',
    toggleVisible: toggle ? toggle.getBoundingClientRect().height > 0 : null,
    filterMode: sheet ? (getComputedStyle(sheet).display === 'contents' ? 'inline' : 'sheet') : null,
    sheetVisibility: sheet ? getComputedStyle(sheet).visibility : null,
    gridCols: cols,
    card: box(card),
    media: box(card ? card.querySelector('.shop-card__media') : null),
    taxo: box(taxo),
    taxoCols: tcols,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyLock: getComputedStyle(document.body).overflowY,
    docH: Math.round(document.documentElement.scrollHeight),
    controlsVisible: Array.from(document.querySelectorAll('#shop-toolbar input, #shop-toolbar select')).filter(el => el.getBoundingClientRect().height > 0).length,
    cardCount: document.querySelectorAll('#shop-view > .shop-grid .shop-card').length,
    count: (() => { const c = q('.shop-toolbar__count'); return c ? c.textContent.trim() : null; })()
  };
})()"""

FOCUS_JS = r"""(() => {
  const q = s => document.querySelector(s);
  const parse = c => { const m=String(c).match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(parseFloat); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
  const effBg = el => { let cur=el, st=[]; while(cur){ const c=parse(getComputedStyle(cur).backgroundColor); if(c&&c.a>0) st.push(c); if(c&&c.a>=1) break; cur=cur.parentElement; }
    let base={r:255,g:255,b:255}; for(let i=st.length-1;i>=0;i--){ const s=st[i]; base={r:s.r*s.a+base.r*(1-s.a),g:s.g*s.a+base.g*(1-s.a),b:s.b*s.a+base.b*(1-s.a)}; } return base; };
  const lum = c => { const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const ratio = (fg,bg) => { const a=lum(fg),b=lum(bg),hi=Math.max(a,b),lo=Math.min(a,b); return Math.round(((hi+0.05)/(lo+0.05))*100)/100; };
  const el = q('.shop-card__add') || q('.shop-card__media') || q('.shop-taxonomy__item');
  if (!el) return null;
  el.focus();
  const cs = getComputedStyle(el);
  const bg = effBg(el.parentElement || el);
  const oc = parse(cs.outlineColor) || {r:0,g:0,b:0,a:1};
  const ocs = oc.a<1 ? {r:oc.r*oc.a+bg.r*(1-oc.a), g:oc.g*oc.a+bg.g*(1-oc.a), b:oc.b*oc.a+bg.b*(1-oc.a)} : oc;
  return {outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, style: cs.outlineStyle, offset: cs.outlineOffset,
    ratio: ratio(ocs, bg), bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')'};
})()"""


def goto_products(page, hash='#/products', wait=1800):
    page.evaluate('location.hash = "%s"' % hash)
    page.wait_for_timeout(wait)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ============ مصفوفة العرض ============
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:160]}))
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:160], 'k': 'matrix'}) if m.type in ('error', 'warning') else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    for w in WIDTHS:
        page.set_viewport_size({'width': w, 'height': 900})
        page.wait_for_timeout(400)
        goto_products(page)
        R['matrix'][str(w)] = page.evaluate(MATRIX_JS)
        R['matrix'][str(w)]['focus'] = page.evaluate(FOCUS_JS)
        print('%-5d header=%-4s toolbar=%-7s filters=%-7s cols=%s card=%sx%s taxo=%s cols=%s ov=%s lock=%s' % (
            w, R['matrix'][str(w)]['headerH'], R['matrix'][str(w)]['toolbarMode'], R['matrix'][str(w)]['filterMode'],
            R['matrix'][str(w)]['gridCols'], R['matrix'][str(w)]['card'] and R['matrix'][str(w)]['card']['w'],
            R['matrix'][str(w)]['card'] and R['matrix'][str(w)]['card']['h'], R['matrix'][str(w)]['taxoCols'],
            R['matrix'][str(w)]['taxo'] and ('%dx%d' % (R['matrix'][str(w)]['taxo']['w'], R['matrix'][str(w)]['taxo']['h'])),
            R['matrix'][str(w)]['overflow'], R['matrix'][str(w)]['bodyLock']))
    ctx.close()

    # ============ انحدار 3C (طلبات + نتائج) ============
    ctx = b.new_context(viewport={'width': 1024, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    goto_products(page)
    cases = [('base', '#/products'), ('min400', '#/products?minPrice=400'), ('max400', '#/products?maxPrice=400'),
             ('min99999', '#/products?minPrice=99999'), ('range', '#/products?minPrice=300&maxPrice=600'),
             ('category', '#/products?categoryId=293'), ('brand', '#/products?brandId=292'),
             ('sort', '#/products?sortBy=price&sortOrder=asc'), ('offers', '#/products?offers=1'),
             ('page2', '#/products?page=2')]
    for name, h in cases:
        reqs.clear()
        page.evaluate('location.hash = "%s"' % h)
        page.wait_for_timeout(1900)
        R['requests'][name] = {
            'reqs': list(reqs),
            'cards': page.evaluate("document.querySelectorAll('#shop-view > .shop-grid .shop-card').length"),
            'count': page.evaluate("(() => { const c=document.querySelector('.shop-toolbar__count'); return c?c.textContent.trim():null; })()"),
            'hash': page.evaluate('location.hash'),
        }
        print('%-9s cards=%s count=%-9s reqs=%s' % (name, R['requests'][name]['cards'], R['requests'][name]['count'], R['requests'][name]['reqs']))
    # فتح/إغلاق اللوحة لا يجب أن يولّد طلبًا
    page.set_viewport_size({'width': 390, 'height': 900})
    page.wait_for_timeout(300)
    goto_products(page)
    reqs.clear()
    page.evaluate("document.getElementById('shop-filters-toggle').click()")
    page.wait_for_timeout(800)
    page.keyboard.press('Escape')
    page.wait_for_timeout(800)
    R['requests']['open_close_sheet'] = {'reqs': list(reqs)}
    print('sheet open/close reqs:', R['requests']['open_close_sheet']['reqs'])
    ctx.close()

    # ============ انحدار Home / Menu / Search / Header ============
    for w in (390, 768, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1600)
        R['regression']['home_%d' % w] = page.evaluate(r"""(() => {
          const q = s => document.querySelector(s);
          const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.y)}; };
          return {headerH: Math.round(q('.shop-header').getBoundingClientRect().height),
            hero: !!q('.shop-hero'), homeCard: box(q('#shop-home-products .shop-card') || q('.shop-home .shop-card')),
            homeCards: document.querySelectorAll('#shop-home-products .shop-card, .shop-home .shop-card').length,
            homeTaxo: box(q('.shop-home .shop-taxonomy__item')),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            bodyLock: getComputedStyle(document.body).overflowY}; })()""")
        print('home %-5d' % w, R['regression']['home_%d' % w])
        if w == 390:
            # القائمة
            page.click('#shop-burger'); page.wait_for_timeout(800)
            R['regression']['menu_open'] = page.evaluate("({open: !!document.querySelector('.shop-drawer.is-open'), body: getComputedStyle(document.body).overflowY, focus: document.activeElement ? String(document.activeElement.className).slice(0,30) : null})")
            page.keyboard.press('Escape'); page.wait_for_timeout(800)
            R['regression']['menu_closed'] = page.evaluate("({open: !!document.querySelector('.shop-drawer.is-open'), body: getComputedStyle(document.body).overflowY, focus: document.activeElement ? (document.activeElement.id||String(document.activeElement.className).slice(0,30)) : null})")
            # البحث
            page.click('#shop-search-btn'); page.wait_for_timeout(900)
            R['regression']['search_open'] = page.evaluate("({open: !!document.querySelector('.shop-search-sheet.is-open'), top: Math.round(document.querySelector('.shop-search-sheet').getBoundingClientRect().y), body: getComputedStyle(document.body).overflowY, focus: document.activeElement ? document.activeElement.id : null})")
            page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1500)
            R['regression']['search_rows'] = page.evaluate("""(() => { const rows = Array.from(document.querySelectorAll('.shop-search-row'));
              return {rows: rows.length, rowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : null,
                img: (() => { const i = document.querySelector('.shop-search-row img'); return i ? {w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height)} : null; })(),
                cardLeak: document.querySelectorAll('.shop-search-row .shop-card').length,
                status: (() => { const s = document.querySelector('.shop-search-sheet [role=status], .shop-search-sheet [aria-live]'); return s ? s.textContent.trim().slice(0, 30) : null; })()}; })()""")
            page.keyboard.press('Escape'); page.wait_for_timeout(800)
            R['regression']['search_closed'] = page.evaluate("({open: !!document.querySelector('.shop-search-sheet.is-open'), body: getComputedStyle(document.body).overflowY, focus: document.activeElement ? document.activeElement.id : null})")
            print('menu/search:', json.dumps({k: R['regression'][k] for k in ['menu_open', 'menu_closed', 'search_open', 'search_rows', 'search_closed']}, ensure_ascii=False))
            # التصنيفات/العلامات
            page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(1900)
            R['regression']['taxo_390'] = page.evaluate(MATRIX_JS)
            page.screenshot(path=os.path.join(OUT, '%s-categories-390.png' % MODE))
            page.evaluate('location.hash = "#/products?view=brands"'); page.wait_for_timeout(1900)
            R['regression']['brands_390'] = page.evaluate(MATRIX_JS)
            page.screenshot(path=os.path.join(OUT, '%s-brands-390.png' % MODE))
        if w == 1366:
            page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(1900)
            R['regression']['taxo_1366'] = page.evaluate(MATRIX_JS)
            page.screenshot(path=os.path.join(OUT, '%s-categories-1366.png' % MODE))
        ctx.close()

    # ============ انحدار 3D/3E الأبعاد + داكن ============
    for w in (390, 1024, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        goto_products(page)
        R['regression']['cards_%d' % w] = page.evaluate(MATRIX_JS)
        ctx.close()

    # ============ التركيز في اللوحة المفتوحة (فاتح/داكن) ============
    for theme in ('light', 'dark'):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        goto_products(page)
        page.evaluate("document.getElementById('shop-filters-toggle').click()")
        page.wait_for_timeout(700)
        R['regression']['focus_sheet_%s' % theme] = page.evaluate(FOCUS_JS)
        page.screenshot(path=os.path.join(OUT, '%s-filters-390-%s.png' % (MODE, theme)))
        page.keyboard.press('Escape')
        page.wait_for_timeout(600)
        R['regression']['focus_card_%s' % theme] = page.evaluate(FOCUS_JS)
        ctx.close()

    b.close()

with open(os.path.join(OUT, 'matrix3g-%s.json' % MODE), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n%s: console=%d' % (MODE, len(R['console'])))
