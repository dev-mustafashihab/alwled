"""PHASE 3 · STEP 3A — Audit (قراءة فقط): صفحات الكتالوج + البطاقة + الحالات + الثيمات + الانحدار.

الاستخدام: python3 audit_pages.py
لا يعدّل أي ملف تطبيق · لا يكتب بيانات · كل القياسات قراءة فقط.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3a'
os.makedirs(OUT, exist_ok=True)

WIDTHS = [360, 390, 430, 600, 768, 1024, 1280, 1366, 1440, 1920]
R = {}
R['console'] = []
R['failed_requests'] = []
R['requests'] = []
R['shots'] = []

MEASURE = """(() => {
  const px = v => Math.round(v * 100) / 100;
  const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {x: px(b.x), y: px(b.y), w: px(b.width), h: px(b.height), top: px(b.top), bottom: px(b.bottom)}; };
  const C = (el, ps) => { if (!el) return null; const c = getComputedStyle(el); const o = {};
    ps.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const txt = el => el ? (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80) : null;
  const view = q('#shop-view');
  const vb = view ? view.getBoundingClientRect() : null;
  const cards = qa('.shop-card');
  const grid = q('.shop-grid');
  const crumb = q('.shop-crumbs');
  const h1 = q('#shop-view h1');
  const sub = q('.shop-section__sub');
  const toolbar = q('.shop-toolbar');
  const toggle = q('.shop-filters__toggle');
  const count = q('.shop-toolbar__count');
  const state = q('.state');
  const skel = qa('.skeleton');
  const taxo = qa('.shop-taxonomy__item');
  const pag = q('.pagination');
  const cardInfo = cards.map(c => {
    const media = c.querySelector('.shop-card__media');
    const img = c.querySelector('.shop-card__media img');
    const nameEl = c.querySelector('.shop-card__name');
    const nameLink = nameEl ? nameEl.querySelector('a') : null;
    const add = c.querySelector('.shop-card__add');
    const details = c.querySelector('.shop-card__details');
    const priceNow = c.querySelector('.shop-price__now');
    const priceWas = c.querySelector('.shop-price__was');
    const meta = c.querySelector('.shop-card__meta');
    const desc = c.querySelector('.shop-card__desc');
    const flag = c.querySelector('.shop-card__flags .badge');
    const foot = c.querySelector('.shop-card__foot');
    const body = c.querySelector('.shop-card__body');
    const actions = c.querySelector('.shop-card__actions');
    const nm = nameEl ? nameEl.getBoundingClientRect() : null;
    const lh = nameEl ? parseFloat(getComputedStyle(nameEl).lineHeight) || 0 : 0;
    return {
      rect: R(c), media: R(media), mediaImg: img ? R(img) : null,
      mediaImgCss: img ? C(img, ['object-fit', 'width', 'height', 'display']) : null,
      mediaCss: C(media, ['height', 'background-color', 'overflow', 'border-radius', 'padding']),
      bodyCss: C(body, ['padding', 'gap', 'display']),
      name: txt(nameEl), nameRect: R(nameEl),
      nameCss: C(nameEl, ['font-size', 'font-weight', 'line-height', 'display', 'overflow']),
      nameLines: lh ? Math.round((nm ? nm.height : 0) / lh) : null,
      nameLinkHref: nameLink ? nameLink.getAttribute('href') : null,
      meta: txt(meta), metaRect: R(meta), metaCss: C(meta, ['font-size', 'color', 'gap', 'display']),
      desc: txt(desc), descRect: R(desc), descCss: C(desc, ['font-size', 'color', 'display', 'overflow']),
      flag: txt(flag), flagRect: R(flag), flagCss: C(flag, ['font-size', 'padding', 'border-radius', 'background-color', 'color']),
      foot: R(foot), footCss: C(foot, ['display', 'align-items', 'gap', 'justify-content', 'flex-wrap']),
      priceNow: txt(priceNow), priceNowCss: C(priceNow, ['font-size', 'font-weight', 'color']),
      priceWas: txt(priceWas), priceWasCss: C(priceWas, ['font-size', 'color', 'text-decoration-line']),
      priceBadge: txt(c.querySelector('.shop-card__foot .badge')),
      add: txt(add), addRect: R(add), addCss: C(add, ['min-height', 'height', 'font-size', 'background-color', 'color', 'border-radius', 'flex']),
      addAria: add ? add.getAttribute('aria-label') : null,
      addDisabled: add ? add.hasAttribute('disabled') : null,
      details: txt(details), detailsRect: R(details), detailsCss: C(details, ['min-height', 'height', 'font-size', 'border-radius', 'flex']),
      actionsRect: R(actions), actionsCss: C(actions, ['display', 'gap', 'grid-template-columns']),
      cardCss: C(c, ['border-top-width', 'border-top-color', 'border-radius', 'background-color', 'box-shadow', 'overflow', 'display']),
      clickable: {
        media: !!media && media.tagName === 'A', name: !!nameLink, details: !!details,
        card: c.tagName === 'A' || !!c.querySelector(':scope > a')
      }
    };
  });
  return {
    viewport: {w: window.innerWidth, h: window.innerHeight},
    hash: location.hash,
    h1: txt(h1), h1Css: C(h1, ['font-size', 'font-weight', 'color', 'margin']), h1Rect: R(h1),
    sub: txt(sub), subCss: C(sub, ['font-size', 'color']),
    crumb: crumb ? {text: txt(crumb), rect: R(crumb), css: C(crumb, ['font-size', 'color', 'display', 'gap', 'margin', 'padding']),
                    items: qa('.shop-crumbs > *').map(n => ({tag: n.tagName, text: txt(n), rect: R(n), href: n.getAttribute && n.getAttribute('href')}))} : null,
    toolbar: toolbar ? {rect: R(toolbar), css: C(toolbar, ['display', 'grid-template-columns', 'gap', 'padding', 'border-top-width', 'border-radius', 'background-color', 'box-shadow']),
                        fields: qa('.shop-toolbar__field').map(f => ({label: txt(f.querySelector('.shop-toolbar__label')), rect: R(f),
                          control: (() => { const c = f.querySelector('input, select'); return c ? {tag: c.tagName, type: c.getAttribute('type'),
                            rect: R(c), css: C(c, ['height', 'min-height', 'font-size', 'background-color', 'border-top-color', 'border-radius', 'padding-inline-start']),
                            aria: c.getAttribute('aria-label'), id: c.id} : null; })()}))} : null,
    toggle: toggle ? {text: txt(toggle), rect: R(toggle), css: C(toggle, ['min-height', 'height', 'display', 'justify-content', 'padding', 'background-color', 'border-radius', 'border-top-color']),
                      expanded: toggle.getAttribute('aria-expanded')} : null,
    count: count ? {text: txt(count), rect: R(count), css: C(count, ['font-size', 'font-weight', 'color', 'align-self'])} : null,
    grid: grid ? {rect: R(grid), css: C(grid, ['display', 'grid-template-columns', 'gap', 'margin', 'padding']),
                  cols: getComputedStyle(grid).gridTemplateColumns} : null,
    cardsCount: cards.length,
    cards: cardInfo,
    pagination: pag ? {rect: R(pag), css: C(pag, ['display', 'gap', 'justify-content', 'margin']),
                        btns: qa('.pagination__btn').map(b => ({text: txt(b), rect: R(b), disabled: b.hasAttribute('disabled'),
                          css: C(b, ['min-height', 'height', 'padding', 'font-size', 'border-radius', 'background-color', 'color'])}))} : null,
    state: state ? {cls: state.className, rect: R(state), css: C(state, ['padding', 'border-top-width', 'border-top-style', 'border-radius', 'background-color', 'text-align']),
                    icon: txt(state.querySelector('.state__icon')), iconRect: R(state.querySelector('.state__icon')),
                    iconCss: C(state.querySelector('.state__icon'), ['font-size', 'color']),
                    title: txt(state.querySelector('.state__title')), titleCss: C(state.querySelector('.state__title'), ['font-size', 'font-weight', 'color']),
                    text: txt(state.querySelector('.state__text')), textCss: C(state.querySelector('.state__text'), ['font-size', 'color']),
                    actions: qa('.state .btn').map(b => ({text: txt(b), rect: R(b), css: C(b, ['min-height', 'background-color', 'color', 'border-radius'])}))} : null,
    skeletons: skel.length, skeletonInfo: skel.slice(0, 3).map(s => ({cls: s.className, rect: R(s), css: C(s, ['height', 'border-radius', 'background-color', 'animation-name'])})),
    taxonomy: taxo.length ? {count: taxo.length, first: {rect: R(taxo[0]), css: C(taxo[0], ['padding', 'border-radius', 'background-color', 'border-top-color', 'display', 'gap', 'align-items', 'min-height', 'text-decoration-line']),
        name: txt(taxo[0].querySelector('.shop-taxonomy__name')), nameCss: C(taxo[0].querySelector('.shop-taxonomy__name'), ['font-size', 'font-weight', 'color']),
        count: txt(taxo[0].querySelector('.shop-taxonomy__count')), countCss: C(taxo[0].querySelector('.shop-taxonomy__count'), ['font-size', 'color']),
        href: taxo[0].getAttribute('href'), hasIcon: !!taxo[0].querySelector('.shop-taxonomy__icon'),
        iconRect: R(taxo[0].querySelector('.shop-taxonomy__icon'))},
        wrap: (() => { const w = taxo[0].parentElement; return {cls: w.className, rect: R(w), css: C(w, ['display', 'grid-template-columns', 'gap'])}; })(),
        all: taxo.map(t => ({text: txt(t), href: t.getAttribute('href'), rect: R(t)}))} : null,
    overflow: {docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth,
               viewSW: view ? view.scrollWidth : null, viewCW: view ? view.clientWidth : null,
               gridSW: grid ? grid.scrollWidth : null, gridCW: grid ? grid.clientWidth : null},
    container: (() => { const c = q('.shop-container'); return c ? {rect: R(c), css: C(c, ['max-width', 'padding-inline-start', 'padding-inline-end'])} : null; })(),
    theme: document.documentElement.getAttribute('data-theme'),
    headerH: px(q('.shop-header').getBoundingClientRect().height),
    htmlLang: document.documentElement.lang, dir: document.documentElement.dir
  };
})()"""


def shoot(page, name):
    p = os.path.join(OUT, name + '.png')
    page.screenshot(path=p)
    R['shots'].append(p)
    return p


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- A) Products: كل العروض ----------
    for w in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'type': m.type, 'text': m.text[:200]})
                if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: R['console'].append({'type': 'pageerror', 'text': str(e)[:200]}))
        page.on('requestfailed', lambda r: R['failed_requests'].append({'url': r.url[:120], 'reason': str(r.failure)[:80]}))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1500)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1600)
        R['products_%d' % w] = page.evaluate(MEASURE)
        if w in (390, 768, 1024, 1366):
            shoot(page, 'products-%d' % w)
        if w == 390:
            page.evaluate('window.scrollTo(0, 700)')
            page.wait_for_timeout(400)
            shoot(page, 'products-390-midgrid')
            page.evaluate('window.scrollTo(0, 0)')
        print('products %d: cards=%s grid=%s ov=%s' % (
            w, R['products_%d' % w]['cardsCount'], R['products_%d' % w]['grid'] and R['products_%d' % w]['grid']['cols'],
            R['products_%d' % w]['overflow']['docSW'] - R['products_%d' % w]['overflow']['docCW']))
        ctx.close()

    # ---------- B) Categories / Brands pages ----------
    for name, hash_ in [('categories', '#/products?view=categories'), ('brands', '#/products?view=brands')]:
        for w in (390, 768, 1024, 1366):
            ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
            page = ctx.new_page()
            page.on('console', lambda m: R['console'].append({'type': m.type, 'text': m.text[:200]}) if m.type == 'error' else None)
            page.goto(SHOP, wait_until='load')
            page.wait_for_timeout(1400)
            page.evaluate('location.hash = "%s"' % hash_)
            page.wait_for_timeout(1600)
            R['%s_%d' % (name, w)] = page.evaluate(MEASURE)
            if w in (390, 1366):
                shoot(page, '%s-%d' % (name, w))
            d = R['%s_%d' % (name, w)]
            print('%s %d: items=%s ov=%s' % (name, w, d['taxonomy'] and d['taxonomy']['count'],
                  d['overflow']['docSW'] - d['overflow']['docCW']))
            ctx.close()

    # ---------- C) Category results + Brand results ----------
    for name, hash_ in [('category_results', '#/products?categoryId=293'), ('brand_results', '#/products?brandId=254')]:
        for w in (390, 1366):
            ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
            page = ctx.new_page()
            page.goto(SHOP, wait_until='load')
            page.wait_for_timeout(1400)
            page.evaluate('location.hash = "%s"' % hash_)
            page.wait_for_timeout(1700)
            R['%s_%d' % (name, w)] = page.evaluate(MEASURE)
            if w == 390:
                shoot(page, '%s-390' % name)
            d = R['%s_%d' % (name, w)]
            print('%s %d: cards=%s h1=%s count=%s' % (name, w, d['cardsCount'], d['h1'], d['count'] and d['count']['text']))
            ctx.close()

    # ---------- D) Empty (بحث بلا نتائج) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products?search=zzzznothing"')
    page.wait_for_timeout(1800)
    R['empty_search_390'] = page.evaluate(MEASURE)
    shoot(page, 'empty-search-390')
    print('empty:', R['empty_search_390']['state'] and R['empty_search_390']['state']['title'])
    ctx.close()

    # ---------- E) Loading (تعليق طلب المنتجات) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.route('**/products?*', lambda route: None)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1500)
    R['loading_390'] = page.evaluate(MEASURE)
    shoot(page, 'loading-390')
    print('loading: skeletons=%s' % R['loading_390']['skeletons'])
    ctx.close()

    # ---------- F) Error (إجهاض الطلب — محلي فقط) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.route('**/products?*', lambda route: route.abort())
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(2200)
    R['error_390'] = page.evaluate(MEASURE)
    shoot(page, 'error-390')
    print('error:', R['error_390']['state'] and (R['error_390']['state']['title'], R['error_390']['state']['text']))
    ctx.close()

    # ---------- G) Dark mode ----------
    for name, hash_ in [('products', '#/products'), ('categories', '#/products?view=categories'), ('brands', '#/products?view=brands')]:
        for w in (390, 1366):
            ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
            page = ctx.new_page()
            page.goto(SHOP, wait_until='load')
            page.wait_for_timeout(1400)
            page.evaluate('location.hash = "%s"' % hash_)
            page.wait_for_timeout(1700)
            R['dark_%s_%d' % (name, w)] = page.evaluate(MEASURE)
            if w in (390, 1366):
                shoot(page, 'dark-%s-%d' % (name, w))
            print('dark %s %d ok' % (name, w))
            ctx.close()

    # ---------- H) Add to cart (زائر — لا كتابة بيانات) ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'type': m.type, 'text': m.text[:200]}) if m.type == 'error' else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1700)
    R['addtocart_before'] = page.evaluate("""(() => ({prompt: !!document.querySelector('.shop-auth-prompt, [class*=auth]'),
      badge: document.getElementById('shop-cart-badge') ? document.getElementById('shop-cart-badge').textContent : null,
      visitorState: window.ALW && ALW.shop ? ALW.shop.visitorState() : null}))()""")
    page.click('.shop-card__add')
    page.wait_for_timeout(1200)
    R['addtocart_after'] = page.evaluate("""(() => { const p = document.querySelector('.shop-auth-prompt, .shop-modal, [role=dialog]');
      return {promptShown: !!p, promptText: p ? (p.textContent||'').trim().replace(/\\s+/g,' ').slice(0,120) : null,
              badge: document.getElementById('shop-cart-badge') ? document.getElementById('shop-cart-badge').textContent : null,
              bodyLock: getComputedStyle(document.body).overflowY}; })()""")
    shoot(page, 'addtocart-guest-1366')
    print('addtocart guest:', R['addtocart_after'])
    ctx.close()

    # ---------- I) انحدار المراحل المقفلة ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1700)
    R['regression'] = page.evaluate("""(() => { const q=s=>document.querySelector(s);
      const R2 = el => { const b = el.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height)}; };
      return {homeCards: document.querySelectorAll('#shop-view .shop-card').length,
              hero: !!q('.shop-home-slider, .shop-hero'),
              headerH: Math.round(q('.shop-header').getBoundingClientRect().height),
              logo: R2(q('.shop-brand__logo')), burger: R2(q('#shop-burger')),
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()""")
    page.click('#shop-search-btn')
    page.wait_for_timeout(1200)
    R['regression']['searchSheet'] = page.evaluate("""(() => { const s = document.getElementById('shop-search-sheet');
      return {top: Math.round(s.getBoundingClientRect().top), bg: getComputedStyle(s).backgroundColor}; })()""")
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.click('#shop-burger')
    page.wait_for_timeout(800)
    R['regression']['menu'] = page.evaluate("""(() => ({rowH: Math.round(document.querySelector('.shop-drawer__link').getBoundingClientRect().height),
      drawerTop: Math.round(document.getElementById('shop-drawer').getBoundingClientRect().top)}))()""")
    print('regression:', R['regression'])
    ctx.close()
    b.close()

with open(os.path.join(OUT, 'audit-pages.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nreport:', os.path.join(OUT, 'audit-pages.json'))
print('console entries:', len(R['console']), '| failed requests:', len(R['failed_requests']), '| shots:', len(R['shots']))
