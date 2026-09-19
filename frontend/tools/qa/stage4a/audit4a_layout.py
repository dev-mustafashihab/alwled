"""PHASE 4 · STEP 4A — تدقيق PDP: بنية/هرمية/معرض/شراء/معلومات/مشابهة/استجابة/داكن (قراءة فقط)."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage4a'
os.makedirs(OUT, exist_ok=True)
R = {'console': [], 'failed': [], 'requests': {}, 'hierarchy': {}, 'matrix': {}, 'gallery': {}, 'buy': {}, 'related': {}, 'dark': {}, 'misc': {}}
WIDTHS = [360, 390, 430, 600, 768, 769, 900, 1023, 1024, 1280, 1366, 1440, 1920]

LAYOUT = r"""(() => {
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y)}; };
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const prod = q('.shop-product');
  const grid = prod ? getComputedStyle(prod).gridTemplateColumns.split(' ').filter(Boolean) : [];
  const stage = q('.shop-gallery__stage');
  const facts = qa('.shop-fact').map(f => ({ label: (f.querySelector('.shop-fact__label') || {}).textContent,
    value: (f.querySelector('.shop-fact__value') || {}).textContent }));
  const add = q('#shop-add-to-cart');
  const meta = q('.shop-buy .shop-card__meta');
  return {
    vw: window.innerWidth,
    productCols: grid.length, productColsVal: grid.join(' '),
    productGap: cs(prod, 'gap'),
    stage: box(stage), stageAspect: cs(stage, 'aspectRatio'), stageRadius: cs(stage, 'borderRadius'),
    stageBorder: cs(stage, 'borderColor'), stageBg: cs(stage, 'backgroundColor'),
    stageImg: (() => { const i = q('.shop-gallery__stage img'); return i ? { fit: cs(i, 'objectFit'), alt: i.getAttribute('alt'), src: String(i.getAttribute('src')).slice(0, 30), box: box(i) } : null; })(),
    placeholder: (() => { const p = q('.shop-gallery__stage .shop-card__placeholder'); return p ? { bg: cs(p, 'backgroundImage').slice(0, 60), color: cs(p, 'color'), box: box(p) } : null; })(),
    thumbs: qa('.shop-gallery__thumb').length,
    thumbsBox: box(q('.shop-gallery__thumbs')),
    thumbFirst: (() => { const t = q('.shop-gallery__thumb'); return t ? { box: box(t), pressed: t.getAttribute('aria-pressed'), label: t.getAttribute('aria-label'),
      border: cs(t, 'borderColor'), shadow: cs(t, 'boxShadow').slice(0, 40) } : null; })(),
    title: (() => { const t = q('.shop-buy__title'); return t ? { tag: t.tagName, text: t.textContent.trim().slice(0, 60), box: box(t),
      fontSize: cs(t, 'fontSize'), color: cs(t, 'color'), lineHeight: cs(t, 'lineHeight') } : null; })(),
    priceBox: box(q('.shop-buy__price')),
    priceNow: (() => { const p = q('.shop-buy__price .shop-price__now'); return p ? { text: p.textContent.trim(), fontSize: cs(p, 'fontSize'), color: cs(p, 'color') } : null; })(),
    priceWas: (() => { const p = q('.shop-buy__price .shop-price__was'); return p ? { text: p.textContent.trim(), fontSize: cs(p, 'fontSize'), color: cs(p, 'color'), deco: cs(p, 'textDecorationLine') } : null; })(),
    priceOff: (() => { const p = q('.shop-buy__price .shop-price__off'); return p ? { text: p.textContent.trim(), bg: cs(p, 'backgroundColor'), color: cs(p, 'color') } : null; })(),
    priceBg: cs(q('.shop-buy__price'), 'backgroundColor'),
    metaText: meta ? meta.textContent.trim().slice(0, 80) : null,
    metaSpans: meta ? meta.children.length : 0,
    facts: facts,
    factsCols: cs(q('.shop-buy__facts'), 'gridTemplateColumns'),
    qty: (() => { const b = q('.shop-qty'); const i = q('#shop-qty'); const btns = qa('.shop-qty__btn');
      return b ? { box: box(b), role: b.getAttribute('role'), label: b.getAttribute('aria-label'),
        input: i ? { value: i.value, min: i.getAttribute('min'), max: i.getAttribute('max'), label: i.getAttribute('aria-label'), box: box(i) } : null,
        btn0: btns[0] ? { label: btns[0].getAttribute('aria-label'), box: box(btns[0]) } : null,
        btn1: btns[1] ? { label: btns[1].getAttribute('aria-label'), box: box(btns[1]) } : null } : null; })(),
    add: add ? { text: add.textContent.trim(), box: box(add), disabled: add.disabled, ariaDisabled: add.getAttribute('aria-disabled'),
      name: add.getAttribute('aria-label'), bg: cs(add, 'backgroundColor'), color: cs(add, 'color'), radius: cs(add, 'borderRadius') } : null,
    actions: (() => { const a = q('.shop-buy__actions'); return a ? { display: cs(a, 'display'), box: box(a) } : null; })(),
    note: (() => { const n = q('.shop-buy .shop-note'); return n ? n.textContent.trim().slice(0, 120) : null; })(),
    panels: qa('.shop-panel').map(p => ({ title: (p.querySelector('.shop-panel__title') || {}).textContent, box: box(p),
      bg: cs(p, 'backgroundColor'), border: cs(p, 'borderColor'), radius: cs(p, 'borderRadius') })),
    specs: qa('.shop-specs .shop-fact').length,
    crumbs: qa('.shop-crumbs a, .shop-crumbs span').map(c => ({ tag: c.tagName, text: c.textContent.trim().slice(0, 22), href: c.getAttribute('href') })),
    crumbsNav: !!q('nav.shop-crumbs'),
    related: (() => { const s = qa('#shop-view > .shop-section').find(x => (x.textContent || '').indexOf('منتجات مشابهة') !== -1);
      if (!s) return null;
      const g = s.querySelector('.shop-grid'); const c = s.querySelector('.shop-card');
      return { cards: s.querySelectorAll('.shop-card').length, gridCols: g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        card: box(c), media: box(c ? c.querySelector('.shop-card__media') : null), mediaAspect: c ? cs(c.querySelector('.shop-card__media'), 'aspectRatio') : null,
        addRadius: c ? cs(c.querySelector('.shop-card__add'), 'borderRadius') : null, addW: c ? box(c.querySelector('.shop-card__add')) : null,
        details: c && c.querySelector('.shop-card__details') ? cs(c.querySelector('.shop-card__details'), 'display') : null,
        desc: c && c.querySelector('.shop-card__desc') ? cs(c.querySelector('.shop-card__desc'), 'display') : null,
        metaSpans: c && c.querySelector('.shop-card__meta') ? c.querySelector('.shop-card__meta').children.length : null,
        cardBg: c ? cs(c, 'backgroundColor') : null }; })(),
    h1: qa('h1').map(h => h.textContent.trim().slice(0, 40)),
    h2: qa('h2').map(h => h.textContent.trim().slice(0, 30)),
    dir: getComputedStyle(document.documentElement).direction,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docH: Math.round(document.documentElement.scrollHeight),
    footerY: (() => { const f = q('.shop-footer'); return f ? Math.round(f.getBoundingClientRect().y) : null; })(),
    body: cs(document.body, 'backgroundColor'), bodyColor: cs(document.body, 'color')
  };
})()"""


def go(page, hash, wait=2200):
    page.evaluate('location.hash = "%s"' % hash)
    page.wait_for_timeout(wait)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ===== A) مصفوفة العروض على PDP =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'matrix'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:150]}))
    page.on('requestfailed', lambda r: R['failed'].append({'u': r.url[-70:]}))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    for w in WIDTHS:
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(400)
        go(page, '#/products/633')
        m = page.evaluate(LAYOUT)
        R['matrix'][str(w)] = {k: m[k] for k in ['vw', 'productCols', 'productColsVal', 'stage', 'stageAspect', 'title', 'priceNow', 'add', 'qty',
                                                 'factsCols', 'thumbs', 'thumbFirst', 'related', 'crumbs', 'overflow', 'docH', 'h1', 'h2', 'panels', 'placeholder', 'note']}
        print('%-5d cols=%s stage=%sx%s title=%s add=%sx%s dis=%s qty=%s facts=%s thumbs=%s rel=%s ov=%s docH=%s' % (
            w, m['productCols'], m['stage'] and m['stage']['w'], m['stage'] and m['stage']['h'],
            m['title'] and m['title']['fontSize'], m['add'] and m['add']['box']['w'], m['add'] and m['add']['box']['h'],
            m['add'] and m['add']['disabled'], m['qty'] and m['qty']['box']['h'], (m['factsCols'] or '').count(' '), m['thumbs'],
            m['related'] and ('%d cards %s' % (m['related']['cards'], m['related']['card'])), m['overflow'], m['docH']))
        if w in (390, 1366):
            page.screenshot(path=os.path.join(OUT, 'pdp-%d.png' % w))
    ctx.close()

    # ===== B) هرمية + منتج مخصوم (632) =====
    for pid, tag in [(633, 'normal'), (632, 'discounted')]:
        ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
        page = ctx.new_page()
        reqs = []
        page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
        page.on('response', lambda r: R['requests'].setdefault(tag, []).append({'u': r.url.split('/api/v1/')[-1][:70], 's': r.status}) if '/api/v1/' in r.url else None)
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
        go(page, '#/products/%d' % pid, 2600)
        R['hierarchy'][tag] = page.evaluate(LAYOUT)
        R['requests'][tag + '_list'] = list(reqs)
        h = R['hierarchy'][tag]
        print('\n== %s (%d) ==' % (tag, pid))
        print('  title:', h['title'] and h['title']['text'], '| price:', h['priceNow'] and h['priceNow']['text'], '| was:', h['priceWas'], '| off:', h['priceOff'])
        print('  meta:', h['metaText'], '| facts:', [(f['label'], f['value']) for f in h['facts']])
        print('  add:', h['add'] and (h['add']['text'], h['add']['disabled'], h['add']['box']), '| qty:', h['qty'] and (h['qty']['input']['value'], h['qty']['box']))
        print('  note:', h['note'])
        print('  panels:', h['panels'], '| crumbs:', [c['text'] for c in h['crumbs']], '| h1/h2:', h['h1'], h['h2'])
        print('  related:', h['related'], '\n  requests:', list(reqs))
        page.screenshot(path=os.path.join(OUT, 'pdp-%s-1366.png' % tag))
        ctx.close()

    # ===== C) داكن =====
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'dark'}) if m.type == 'error' else None)
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
        go(page, '#/products/632', 2400)
        R['dark'][str(w)] = page.evaluate(LAYOUT)
        d = R['dark'][str(w)]
        print('\ndark %d: body=%s stage=%s priceBg=%s fact bg=%s panel bg=%s title=%s add=%s' % (
            w, d['body'], d['stageBg'], d['priceBg'], d['facts'] and None, d['panels'] and d['panels'][0]['bg'], d['title'] and d['title']['color'], d['add'] and d['add']['bg']))
        page.screenshot(path=os.path.join(OUT, 'pdp-dark-%d.png' % w))
        ctx.close()

    b.close()

with open(os.path.join(OUT, 'audit4a-layout.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nconsole=%d failed=%d' % (len(R['console']), len(R['failed'])))
