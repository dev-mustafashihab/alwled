"""PHASE 3 · STEP 3D — قبل/بعد: بطاقة المنتج في القوائم (Products/Category/Brand results).

الاستخدام: python3 probe3d.py before | after
قراءة فقط · حقن QA محلي غير دائم للأنماط الناقصة (عنوان طويل/بلا علامة) داخل جلسة الفحص فقط.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3d'
os.makedirs(OUT, exist_ok=True)
R = {'mode': MODE, 'console': [], 'failed': [], 'shots': []}

WIDTHS = [360, 390, 430, 600, 768, 769, 900, 1024, 1366, 1920]

ANATOMY = r"""(() => {
  const px = v => Math.round(v * 100) / 100;
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const H = el => el ? px(el.getBoundingClientRect().height) : null;
  const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {x: px(b.x), y: px(b.y), w: px(b.width), h: px(b.height), top: px(b.top), bottom: px(b.bottom)}; };
  const C = (el, ps) => { if (!el) return null; const c = getComputedStyle(el); const o = {};
    ps.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
  const vis = el => { if (!el) return false; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && cs.display !== 'none'; };
  const grid = q('#shop-view > .shop-grid');
  const cards = qa('#shop-view > .shop-grid .shop-card');
  const vh = window.innerHeight;
  const info = cards.map((c, i) => {
    const media = c.querySelector('.shop-card__media');
    const img = c.querySelector('.shop-card__media img');
    const ph = c.querySelector('.shop-card__placeholder');
    const body = c.querySelector('.shop-card__body');
    const meta = c.querySelector('.shop-card__meta');
    const metas = qa('.shop-card__meta > span').map(s => ({t: (s.textContent || '').trim().slice(0, 26), vis: vis(s), h: H(s)}));
    const name = c.querySelector('.shop-card__name');
    const desc = c.querySelector('.shop-card__desc');
    const foot = c.querySelector('.shop-card__foot');
    const price = c.querySelector('.shop-price');
    const now = c.querySelector('.shop-price__now');
    const was = c.querySelector('.shop-price__was');
    const footBadge = c.querySelector('.shop-card__foot .badge');
    const flag = c.querySelector('.shop-card__flags .badge');
    const actions = c.querySelector('.shop-card__actions');
    const add = c.querySelector('.shop-card__add');
    const details = c.querySelector('.shop-card__details');
    const lh = name ? parseFloat(getComputedStyle(name).lineHeight) || 0 : 0;
    const nm = name ? name.getBoundingClientRect().height : 0;
    return {
      i: i, id: c.getAttribute('data-product-id'),
      card: R(c), cardCss: C(c, ['display', 'flex-direction', 'background-color', 'border-top-color', 'border-radius', 'overflow']),
      media: R(media), mediaCss: C(media, ['height', 'aspect-ratio', 'background-color', 'object-fit']),
      img: img ? {rect: R(img), fit: getComputedStyle(img).objectFit, src: (img.getAttribute('src') || '').slice(0, 40)} : null,
      placeholder: ph ? {rect: R(ph), vis: vis(ph)} : null,
      body: R(body), bodyCss: C(body, ['padding', 'gap', 'display', 'flex-direction']),
      meta: R(meta), metaCss: C(meta, ['font-size', 'color', 'gap', 'display', 'flex-wrap']), metaSpans: metas,
      name: (name ? (name.textContent || '').trim().slice(0, 40) : null), nameRect: R(name),
      nameCss: C(name, ['font-size', 'font-weight', 'line-height', 'color', '-webkit-line-clamp', 'display']),
      nameLines: lh ? Math.round(nm / lh) : null,
      desc: desc ? {text: (desc.textContent || '').trim().slice(0, 30), vis: vis(desc), h: H(desc)} : null,
      foot: R(foot), footCss: C(foot, ['margin-top', 'padding-top', 'gap', 'flex-wrap', 'display']),
      priceNow: now ? {t: (now.textContent || '').trim(), rect: R(now), css: C(now, ['font-size', 'font-weight', 'color'])} : null,
      priceWas: was ? {t: (was.textContent || '').trim(), rect: R(was), vis: vis(was), css: C(was, ['font-size', 'color', 'text-decoration-line'])} : null,
      footBadge: footBadge ? {t: (footBadge.textContent || '').trim(), vis: vis(footBadge), rect: R(footBadge)} : null,
      flag: flag ? {t: (flag.textContent || '').trim(), vis: vis(flag), rect: R(flag)} : null,
      actions: R(actions), actionsCss: C(actions, ['display', 'gap', 'flex-wrap', 'margin-top']),
      add: add ? {t: (add.textContent || '').trim(), vis: vis(add), rect: R(add), css: C(add, ['min-height', 'height', 'font-size', 'background-color', 'color'])} : null,
      details: details ? {t: (details.textContent || '').trim(), vis: vis(details), rect: R(details)} : null,
      aboveFold: c.getBoundingClientRect().bottom <= vh
    };
  });
  return {
    vw: window.innerWidth, vh: vh, hash: location.hash,
    theme: document.documentElement.getAttribute('data-theme'),
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docH: Math.round(document.documentElement.scrollHeight),
    grid: grid ? {rect: R(grid), cols: getComputedStyle(grid).gridTemplateColumns, gap: getComputedStyle(grid).gap} : null,
    cardsCount: cards.length, cards: info,
    aboveFoldCount: info.filter(c => c.aboveFold).length,
    headerH: q('.shop-header') ? px(q('.shop-header').getBoundingClientRect().height) : null
  };
})()"""


def shoot(page, name, clip=None):
    p = os.path.join(OUT, '%s-%s.png' % (MODE, name))
    page.screenshot(path=p, clip=clip)
    R['shots'].append(p)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- A) مصفوفة العروض ----------
    for w in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:140], 'w': w}) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:140]}))
        page.on('requestfailed', lambda r: R['failed'].append({'u': r.url[:110], 'r': str(r.failure)[:50]}))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1800)
        d = page.evaluate(ANATOMY)
        R['w%d' % w] = d
        c0 = d['cards'][0] if d['cards'] else None
        print('%-5d cols=%-26s card=%-10s media=%-7s name=%-7s foot=%-7s actions=%-7s add=%-7s aboveFold=%s docH=%s ov=%s' % (
            w, (d['grid'] or {}).get('cols', '')[:26], c0 and '%sx%s' % (round(c0['card']['w']), round(c0['card']['h'])),
            c0 and c0['media'] and round(c0['media']['h']), c0 and c0['nameRect'] and round(c0['nameRect']['h']),
            c0 and c0['foot'] and round(c0['foot']['h']), c0 and c0['actions'] and round(c0['actions']['h']),
            c0 and c0['add'] and round(c0['add']['rect']['h']), d['aboveFoldCount'], d['docH'], d['docOverflow']))
        if w in (360, 390, 430, 600, 768, 769, 900, 1024, 1366, 1920):
            shoot(page, 'products-%d' % w)
        ctx.close()

    # ---------- B) الثيم الداكن ----------
    for w in (390, 1024, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1800)
        R['dark_%d' % w] = page.evaluate(ANATOMY)
        shoot(page, 'products-%d-dark' % w)
        c0 = R['dark_%d' % w]['cards'][0]
        print('dark %-5d card=%sx%s media=%s bg=%s price=%s was=%s' % (w, round(c0['card']['w']), round(c0['card']['h']),
              round(c0['media']['h']), c0['cardCss']['background-color'], c0['priceNow']['css']['color'],
              c0['priceWas'] and c0['priceWas']['css']['color']))
        ctx.close()

    # ---------- C) الأنماط: عادي/مخفّض + عنوان طويل (حقن QA) + بلا علامة ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1300)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    R['variants_390'] = page.evaluate(ANATOMY)
    # عنوان طويل جدًا للبطاقة الأولى (QA فقط)
    page.evaluate("""(() => { const c=document.querySelector('#shop-view > .shop-grid .shop-card .shop-card__name a');
      if (c) c.textContent = 'منتج تجريبي بعنوان عربي طويل جدًا لاختبار الالتفاف والقص داخل بطاقة المنتج في القوائم'; })()""")
    page.wait_for_timeout(400)
    R['longtitle_390'] = page.evaluate(ANATOMY)
    shoot(page, 'longtitle-390')
    page.evaluate("""(() => { const m=document.querySelector('#shop-view > .shop-grid .shop-card .shop-card__meta');
      if (m) m.innerHTML = ''; })()""")   # بلا علامة/ميتا (QA فقط)
    page.wait_for_timeout(400)
    R['nometa_390'] = page.evaluate(ANATOMY)
    shoot(page, 'nometa-390')
    d = R['longtitle_390']
    if d['cards']:
        print('longtitle 390: cards=%s heights=%s ctas=%s prices=%s' % (d['cardsCount'],
              [round(c['card']['h']) for c in d['cards']], [c['add'] and round(c['add']['rect']['bottom']) for c in d['cards']],
              [c['priceNow'] and round(c['priceNow']['rect']['bottom']) for c in d['cards']]))
    print('nometa 390: heights=%s metaH=%s' % ([round(c['card']['h']) for c in R['nometa_390']['cards']],
          [c['meta'] and round(c['meta']['h']) for c in R['nometa_390']['cards']]))
    ctx.close()

    # ---------- D) قصّات تفصيلية ----------
    for w, theme in [(390, 'light'), (1366, 'light')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1800)
        cards = page.evaluate("""(() => Array.from(document.querySelectorAll('#shop-view > .shop-grid .shop-card')).map(c => {
          const b = c.getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height}; }))()""")
        if cards:
            c = cards[0]
            shoot(page, 'crop-%d-normal' % w, clip={'x': max(0, c['x'] - 6), 'y': max(0, c['y'] - 6), 'width': min(w, c['w'] + 12), 'height': c['h'] + 12})
        if len(cards) > 1:
            c = cards[1]
            shoot(page, 'crop-%d-discounted' % w, clip={'x': max(0, c['x'] - 6), 'y': max(0, c['y'] - 6), 'width': min(w, c['w'] + 12), 'height': c['h'] + 12})
        ctx.close()

    # ---------- E) سلوك النقر + السلة (زائر) ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1300)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    click = {}
    for label, sel in [('image', '.shop-card__media'), ('name', '.shop-card__name a'), ('details', '.shop-card__details')]:
        try:
            page.evaluate('location.hash = "#/products"')
            page.wait_for_timeout(1700)
            if sel == '.shop-card__media':
                box = page.evaluate("""(() => { const b=document.querySelector('#shop-view > .shop-grid .shop-card__media').getBoundingClientRect();
                  return {x: b.x + b.width/2, y: b.y + b.height/2}; })()""")
                page.mouse.click(box['x'], box['y'])
            else:
                page.click(sel, timeout=4000)
            page.wait_for_timeout(1500)
            click[label] = {'hash': page.evaluate('location.hash'), 'h1': page.evaluate("(document.querySelector('#shop-view h1')||{}).textContent")}
        except Exception as exc:
            click[label] = {'error': str(exc).split('\n')[0][:80]}
        print('click %-8s %s' % (label, click[label]))
    # إضافة للسلة (زائر)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    reqs.clear()
    before = page.evaluate("""(() => ({badge: (document.getElementById('shop-cart-count')||document.getElementById('shop-cart-badge')||{}).textContent,
      addText: (document.querySelector('.shop-card__add')||{}).textContent, disabled: document.querySelector('.shop-card__add') && document.querySelector('.shop-card__add').hasAttribute('disabled')}))()""")
    page.click('.shop-card__add')
    page.wait_for_timeout(1400)
    after = page.evaluate("""(() => { const dlg=Array.from(document.querySelectorAll('[role=dialog], .modal__panel')).filter(d=>d.offsetParent!==null);
      return {badge: (document.getElementById('shop-cart-count')||document.getElementById('shop-cart-badge')||{}).textContent,
        modal: dlg.map(d=>(d.textContent||'').trim().replace(/\\s+/g,' ').slice(0,60)), bodyOv: getComputedStyle(document.body).overflowY}; })()""")
    R['cart'] = {'before': before, 'after': after, 'net': list(reqs)}
    print('cart guest: before=%s after=%s net=%s' % (before, after, list(reqs)))
    ctx.close()

    # ---------- F) انحدار الفلاتر ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1300)
    reg = {}
    for label, hash_, exp in [('none', '#/products', 2), ('minPrice400', '#/products?minPrice=400', 1), ('min99999', '#/products?minPrice=99999', 0),
                              ('category', '#/products?categoryId=293', 2), ('brand', '#/products?brandId=254', 1),
                              ('sort', '#/products?sortBy=price&sortOrder=asc', 2), ('offers', '#/products?offers=1', 1), ('page2', '#/products?page=2', 2)]:
        page.evaluate('location.hash = "%s"' % hash_)
        page.wait_for_timeout(1800)
        reg[label] = page.evaluate("""(() => ({hash: location.hash, cards: document.querySelectorAll('#shop-view > .shop-grid .shop-card').length,
          count: (document.querySelector('.shop-toolbar__count')||{}).textContent}))()""")
        print('reg %-12s cards=%s (متوقع %s) hash=%s' % (label, reg[label]['cards'], exp, reg[label]['hash']))
    R['reg_filters'] = reg
    # حالة فارغة داكنة
    ctx2 = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    ctx2.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
    p2 = ctx2.new_page()
    p2.goto(SHOP, wait_until='load')
    p2.wait_for_timeout(1300)
    p2.evaluate('location.hash = "#/products?minPrice=99999"')
    p2.wait_for_timeout(1800)
    R['empty_dark_1366'] = p2.evaluate("""(() => { const s=document.querySelector('#shop-view > .state');
      return {title: (s.querySelector('.state__title')||{}).textContent, rect: (() => { const b=s.getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height)}; })()}; })()""")
    shoot(p2, 'empty-1366-dark')
    print('empty dark:', R['empty_dark_1366'])
    ctx2.close()
    ctx.close()

    # ---------- G) انحدار 3F (لوحة داكنة) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1300)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(800)
    R['dark_sheet'] = page.evaluate("""(() => { const s=document.querySelector('.shop-filters__sheet'); const c=document.querySelector('.shop-check');
      return {sheetBg: getComputedStyle(s).backgroundColor, checkBg: getComputedStyle(c).backgroundColor, open: !!document.querySelector('.shop-filters.is-open')}; })()""")
    shoot(page, 'filters-390-dark')
    print('dark sheet:', R['dark_sheet'])
    ctx.close()

    # ---------- H) انحدار 3E ----------
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1300)
        page.evaluate('location.hash = "#/products?view=categories"')
        page.wait_for_timeout(1800)
        R['taxo_%d' % w] = page.evaluate("""(() => { const g=document.querySelector('#shop-view > .shop-taxonomy');
          const i=g && g.querySelector('.shop-taxonomy__item');
          return {cols: g && getComputedStyle(g).gridTemplateColumns, card: i ? {w:Math.round(i.getBoundingClientRect().width),h:Math.round(i.getBoundingClientRect().height)} : null,
            ov: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()""")
        if w in (390, 1366):
            shoot(page, 'categories-%d' % w)
        print('taxo %d: %s' % (w, R['taxo_%d' % w]))
        page.evaluate('location.hash = "#/products?view=brands"')
        page.wait_for_timeout(1800)
        R['taxo_brands_%d' % w] = page.evaluate("""(() => { const g=document.querySelector('#shop-view > .shop-taxonomy');
          const i=g && g.querySelector('.shop-taxonomy__item');
          return {cols: g && getComputedStyle(g).gridTemplateColumns, card: i ? {w:Math.round(i.getBoundingClientRect().width),h:Math.round(i.getBoundingClientRect().height)} : null}; })()""")
        if w in (390, 1366):
            shoot(page, 'brands-%d' % w)
        ctx.close()

    # ---------- I) انحدار Home + Search + Header/Menu ----------
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1900)
        R['home_%d' % w] = page.evaluate("""(() => { const c=document.querySelector('#shop-view .shop-card');
          const m=c && c.querySelector('.shop-card__media'); const n=c && c.querySelector('.shop-card__name');
          const a=c && c.querySelector('.shop-card__add'); const d=c && c.querySelector('.shop-card__desc');
          const fm=c && c.querySelector('.shop-card__foot .badge');
          return {homeCards: document.querySelectorAll('#shop-view .shop-card').length,
            card: c ? {w:Math.round(c.getBoundingClientRect().width), h:Math.round(c.getBoundingClientRect().height)} : null,
            media: m ? Math.round(m.getBoundingClientRect().height) : null,
            nameH: n ? Math.round(n.getBoundingClientRect().height) : null,
            descVis: d ? getComputedStyle(d).display !== 'none' : null,
            footBadgeVis: fm ? getComputedStyle(fm).display !== 'none' : null,
            addVis: a ? getComputedStyle(a).display !== 'none' : null,
            hero: !!document.querySelector('.shop-home-slider, .shop-hero'),
            homeTaxoItem: (() => { const i=document.querySelector('#shop-home-categories .shop-taxonomy__item');
              return i ? {w:Math.round(i.getBoundingClientRect().width),h:Math.round(i.getBoundingClientRect().height)} : null; })(),
            headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()""")
        shoot(page, 'home-%d' % w)
        print('home %d: %s' % (w, R['home_%d' % w]))
        ctx.close()

    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    page.click('#shop-search-btn')
    page.wait_for_timeout(1200)
    page.fill('#shop-search-sheet-input', 'ثلاجة')
    page.wait_for_timeout(1800)
    R['search_390'] = page.evaluate("""(() => { const rows=Array.from(document.querySelectorAll('.shop-search-row'));
      const img=document.querySelector('.shop-search-row img');
      return {rows: rows.length, rowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : null,
        img: img ? {w:Math.round(img.getBoundingClientRect().width), h:Math.round(img.getBoundingClientRect().height)} : null,
        sheetTop: Math.round(document.getElementById('shop-search-sheet').getBoundingClientRect().top),
        cardLeak: document.querySelectorAll('#shop-search-sheet .shop-card').length}; })()""")
    shoot(page, 'search-390')
    print('search 390:', R['search_390'])
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.click('#shop-burger')
    page.wait_for_timeout(800)
    R['menu_390'] = page.evaluate("""(() => ({rowH: Math.round(document.querySelector('.shop-drawer__link').getBoundingClientRect().height),
      drawerTop: Math.round(document.getElementById('shop-drawer').getBoundingClientRect().top)}))()""")
    print('menu 390:', R['menu_390'])
    ctx.close()
    b.close()

with open(os.path.join(OUT, 'probe3d-%s.json' % MODE), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n%s: console=%d failed=%d shots=%d' % (MODE, len(R['console']), len(R['failed']), len(R['shots'])))
