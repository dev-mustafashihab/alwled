"""PHASE 5F — التحقق النهائي: 13 عرضًا × الصفحات (فاتح) · داكن · تكبير 200% · خطوط · أهداف لمس · تباين."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage5'
R = {'matrix': {}, 'dark': {}, 'zoom': {}, 'fonts': {}, 'targets': {}, 'contrast': {}, 'console': [], 'failed': [], 'teal_dark': {}}

OV = r"""(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  docH: Math.round(document.documentElement.scrollHeight),
  clipped: Array.from(document.querySelectorAll('#shop-view *, .shop-header *, .shop-footer *')).filter(el => {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const b = el.getBoundingClientRect(); if (!b.width || !b.height) return false;
    if (el.closest('.shop-home-ticker, .shop-home-slider, .shop-crumbs, .visually-hidden, .shop-footer__sec')) return false;
    return el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll';
  }).slice(0, 6).map(el => (String(el.className) || el.tagName).slice(0, 24) + '|' + (el.textContent || '').trim().slice(0, 14))
}))()"""

TEAL = r"""(() => { const teal = /20, ?184, ?166|15, ?118, ?110|13, ?148, ?136|17, ?94, ?89|52, ?211, ?170|234, ?253, ?247/;
  const out = []; Array.from(document.querySelectorAll('button, .btn, a.btn, input, select, summary, .badge, [role=button], .shop-card, .shop-taxonomy__item')).forEach(el => {
    const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); if (!b.width || !b.height || cs.display === 'none') return;
    if (teal.test(cs.backgroundColor) || teal.test(cs.borderTopColor) || teal.test(cs.color) || teal.test(cs.boxShadow) || teal.test(cs.backgroundImage)) {
      out.push({ cls: String(el.className).slice(0, 26), bg: cs.backgroundColor, bd: cs.borderTopColor, col: cs.color, sh: cs.boxShadow.slice(0, 40), bi: cs.backgroundImage.slice(0, 40) }); } });
  const seen = {}; return out.filter(o => { const k = JSON.stringify(o); if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 10); })()"""

FONT = r"""(() => { const g = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '') : null; };
  return { body: g('body'), hdr_nav: g('.shop-nav__link'), menu: g('.shop-drawer__link'), search: g('.shop-search-sheet__input'),
    card: g('.shop-card__name'), pdp: g('.shop-buy__title'), btn: g('.shop-buy__actions .btn--primary'), input: g('.shop-toolbar input, #shop-filter-search'),
    footer: g('.shop-footer'), cairo: document.fonts.check('16px "Cairo"'), faces: Array.from(document.fonts).map(f => f.family + '/' + f.weight + '/' + f.status) }; })()"""

TARGETS = r"""(() => { const a = document.querySelector('#shop-view .shop-crumbs a'); const f = document.querySelector('.shop-footer__list a');
  const hit = (el, dy) => { if (!el) return null; const b = el.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + dy); return e && e.closest('a') === el ? 1 : 0; };
  return { crumb_box: a ? [Math.round(a.getBoundingClientRect().width), Math.round(a.getBoundingClientRect().height)] : null,
    crumb_hit44: a ? [hit(a, -11), hit(a, 0), hit(a, 11)] : null,
    footer_link: f ? [Math.round(f.getBoundingClientRect().width), Math.round(f.getBoundingClientRect().height)] : null,
    cta: (() => { const c = document.querySelector('.shop-buy__actions .btn--primary'); if (!c) return null; const b = c.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })() }; })()"""


def run(page, name, hash_, key):
    page.evaluate('location.hash = "%s"' % hash_); page.wait_for_timeout(2100)
    R[key][name] = page.evaluate(OV)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    # ===== فاتح: 13 عرضًا × 6 صفحات =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append(m.type + ':' + m.text[:100]) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append('pageerror:' + str(e)[:100]))
    page.on('requestfailed', lambda r: R['failed'].append(r.url[-40:]))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2200)
    for w in [360, 390, 430, 600, 768, 769, 900, 1023, 1024, 1280, 1366, 1440, 1920]:
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(380)
        row = {}
        for n, h in [('home', '#/'), ('products', '#/products'), ('categories', '#/products?view=categories'),
                     ('brands', '#/products?view=brands'), ('pdp', '#/products/632'), ('pdp_oos', '#/products/633')]:
            page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(2000)
            row[n] = page.evaluate(OV)
        R['matrix'][str(w)] = row
        print('%-5d ov home=%s prod=%s cat=%s brand=%s pdp=%s oos=%s | clip=%s' % (w, row['home']['ov'], row['products']['ov'],
              row['categories']['ov'], row['brands']['ov'], row['pdp']['ov'], row['pdp_oos']['ov'], (row['products']['clipped'] or [])[:1]))
    # خطوط + أهداف + 200% (390)
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2200)
    R['fonts']['390'] = page.evaluate(FONT)
    R['targets']['390'] = page.evaluate(TARGETS)
    R['contrast'] = page.evaluate("""(() => { const c = document.querySelector('.shop-buy__actions .btn--primary, .shop-card__add');
      if (!c) return null; const cs = getComputedStyle(c);
      const lum = s => { const m = s.match(/\\d+/g).map(Number).slice(0,3).map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*m[0]+0.7152*m[1]+0.0722*m[2]; };
      const L1 = lum(cs.backgroundColor), L2 = lum(cs.color); const r = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
      return { bg: cs.backgroundColor, fg: cs.color, ratio: Math.round(r*100)/100 }; })()""")
    for h, n in [('#/products', 'products'), ('#/products/632', 'pdp'), ('#/', 'home')]:
        page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(2100)
        base = page.evaluate(OV)
        page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(850)
        R['zoom']['390_' + n] = {'before': base['ov'], 'after': page.evaluate(OV)}
        page.evaluate("document.documentElement.style.fontSize = ''"); page.wait_for_timeout(400)
    # أهداف على الجوال: نافذة المصادقة
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2300)
    page.click('#shop-add-to-cart'); page.wait_for_timeout(1200)
    R['targets']['390_authdlg'] = page.evaluate("""(() => { const b = document.querySelector('.modal .btn--primary, [role=dialog] .btn--primary, .shop-auth .btn--primary');
      return b ? [Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)] : null; })()""")
    R['teal_dark']['390_authdlg'] = page.evaluate(TEAL)
    ctx.close()

    # ===== داكن: 390/768/1024/1366 =====
    for w in [390, 768, 1024, 1366]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append('dark:' + m.type + ':' + m.text[:90]) if m.type in ('error', 'warning') else None)
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2600)
        R['dark'][str(w)] = {'theme': page.evaluate("document.documentElement.getAttribute('data-theme')")}
        for n, h in [('home', '#/'), ('products', '#/products'), ('pdp', '#/products/632')]:
            page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(2100)
            R['dark'][str(w)][n] = page.evaluate(OV)
        R['teal_dark'][str(w)] = page.evaluate(TEAL)
        R['fonts']['dark_%d' % w] = page.evaluate(FONT)
        page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2100)
        base = page.evaluate(OV)
        page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(850)
        R['zoom']['dark_%d_products' % w] = {'before': base['ov'], 'after': page.evaluate(OV)}
        print('dark %-5d home ov=%s prod ov=%s pdp ov=%s | teal=%d | zoom200 ov=%s' % (w, R['dark'][str(w)]['home']['ov'],
              R['dark'][str(w)]['products']['ov'], R['dark'][str(w)]['pdp']['ov'], len(R['teal_dark'][str(w)]),
              R['zoom']['dark_%d_products' % w]['after']['ov']))
        ctx.close()
    b.close()

with open(os.path.join(OUT, 'final5f.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nconsole=%d failed=%d' % (len(R['console']), len(R['failed'])))
print('fonts:', json.dumps(R['fonts'].get('390', {}), ensure_ascii=False)[:400])
print('targets 390:', json.dumps(R['targets'].get('390'), ensure_ascii=False), '| authdlg:', R['targets'].get('390_authdlg'))
print('contrast CTA:', json.dumps(R['contrast'], ensure_ascii=False))
print('teal_dark:', {k: len(v) for k, v in R['teal_dark'].items()})
