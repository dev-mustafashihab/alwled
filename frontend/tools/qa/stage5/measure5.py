"""PHASE 5 — هارنس قياس موحّد (بوابة كل خطوة). الاستخدام: python3 measure5.py <label>"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage5'
os.makedirs(OUT, exist_ok=True)
LABEL = sys.argv[1] if len(sys.argv) > 1 else 'x'
R = {'label': LABEL, 'geo': {}, 'typo': {}, 'matrix': {}, 'zoom': {}, 'console': [], 'failed': [], 'teal': {}, 'fonts': {}}

# أدوار الطباعة المُقاسة (سطح → محدّد)
TYPO_SEL = {
  'brand': '.shop-brand__text strong', 'nav': '.shop-nav__link', 'iconbtn': '.shop-iconbtn',
  'crumbs': '.shop-crumbs a', 'sec_title': '.shop-section__title', 'sec_sub': '.shop-section__sub',
  'card_name': '.shop-card__name', 'card_meta': '.shop-card__meta', 'card_price': '.shop-price__now',
  'card_was': '.shop-price__was', 'card_add': '.shop-card__add', 'badge': '.shop-card .badge',
  'toolbar_label': '.shop-toolbar__label', 'toolbar_count': '.shop-toolbar__count',
  'filter_input': '#shop-filter-search', 'check': '.shop-check',
  'pdp_title': '.shop-buy__title', 'pdp_price': '.shop-buy__price .shop-price__now',
  'pdp_fact_label': '.shop-buy__facts .shop-fact__label', 'pdp_fact_val': '.shop-buy__facts .shop-fact__value',
  'pdp_cta': '.shop-buy__actions .btn--primary', 'qty': '#shop-qty', 'panel_title': '.shop-panel__title',
  'prose': '.shop-prose', 'state_title': '.state__title', 'state_text': '.state__text', 'state_btn': '.state .btn',
  'taxo_name': '.shop-taxonomy__name', 'taxo_count': '.shop-taxonomy__count',
  'footer_link': '.shop-footer a', 'footer_sum': '.shop-footer__sec summary',
  'search_input': '.shop-search-sheet__input', 'search_row_name': '.shop-search-row__name',
  'drawer_link': '.shop-drawer__link', 'body': 'body',
}
TP = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'color', 'backgroundColor', 'height']

GEO = r"""(() => {
  const q = s => document.querySelector(s);
  const box = s => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect();
    return [Math.round(b.width), Math.round(b.height)]; };
  const st = s => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), maxW: getComputedStyle(e).maxWidth, fs: getComputedStyle(e).fontSize }; };
  return { hdr: box('.shop-header__inner'), search_row: box('.shop-search-row'), card: box('#shop-view > .shop-grid > .shop-card'),
    home_card: box('.shop-home .shop-card'), taxo: box('#shop-view > .shop-taxonomy > .shop-taxonomy__item'),
    stage: st('.shop-gallery__stage'), pdp_cta: box('.shop-buy__actions .btn--primary'), facts: box('.shop-buy__facts'),
    add: box('.shop-card__add'), toolbar: box('.shop-toolbar'), filters_toggle: box('.shop-filters__toggle'),
    crumbs: box('.shop-crumbs a'), footer_sum: box('.shop-footer__sec summary'), qty: box('.shop-qty'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docH: Math.round(document.documentElement.scrollHeight) };
})()"""

OVERFLOW = r"""(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  docH: Math.round(document.documentElement.scrollHeight),
  clipped: Array.from(document.querySelectorAll('#shop-view *, .shop-header *, .shop-footer *')).filter(el => {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const b = el.getBoundingClientRect(); if (!b.width || !b.height) return false;
    if (el.closest('.shop-home-ticker, .shop-home-slider, .shop-crumbs, .visually-hidden')) return false;
    return el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll';
  }).slice(0, 8).map(el => (String(el.className) || el.tagName).slice(0, 26) + '|' + (el.textContent || '').trim().slice(0, 16))
}))()"""

TEAL = r"""(() => {
  const teal = /20, ?184, ?166|15, ?118, ?110|13, ?148, ?136|17, ?94, ?89|52, ?211, ?170|234, ?253, ?247|209, ?250, ?236/;
  const out = [];
  Array.from(document.querySelectorAll('button, .btn, a.btn, input, select, summary, .badge, [role=button]')).forEach(el => {
    const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
    if (!b.width || !b.height || cs.display === 'none' || cs.visibility === 'hidden') return;
    if (teal.test(cs.backgroundColor) || teal.test(cs.borderTopColor) || teal.test(cs.color) || teal.test(cs.boxShadow)) {
      out.push({ cls: String(el.className).slice(0, 30), text: (el.textContent || '').trim().slice(0, 20),
        bg: cs.backgroundColor, color: cs.color, box: Math.round(b.width) + 'x' + Math.round(b.height) }); }
  });
  const seen = {}; return out.filter(o => { const k = o.cls + o.text + o.bg; if (seen[k]) return false; seen[k] = 1; return true; });
})()"""

FONTS = r"""(() => ({
  cairo_loaded: document.fonts.check('16px "Cairo"'),
  qomra_loaded: document.fonts.check('16px "Qomra Arabic"'),
  body_family: getComputedStyle(document.body).fontFamily,
  drawer_family: (document.querySelector('.shop-drawer__link') ? getComputedStyle(document.querySelector('.shop-drawer__link')).fontFamily : null),
  faces: Array.from(document.fonts).map(f => f.family + '/' + f.weight + '/' + f.status).slice(0, 12),
  qomra_refs: (getComputedStyle(document.documentElement).getPropertyValue('--shop-menu-font') || '').trim()
}))()"""


def typo(page):
    return page.evaluate("""(sel) => { const out = {};
      Object.entries(sel).forEach(([k, s]) => { const el = document.querySelector(s); if (!el) { out[k] = null; return; }
        const cs = getComputedStyle(el); const o = {}; %s.forEach(p => o[p] = cs[p]); out[k] = o; });
      return out; }""" % json.dumps(TP), TYPO_SEL)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    # ===== 1366: هندسة + طباعة + teal + خطوط =====
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append(m.type + ':' + m.text[:110]) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append('pageerror:' + str(e)[:110]))
    page.on('requestfailed', lambda r: R['failed'].append(r.url[-46:]))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(3000)
    R['fonts']['1366'] = page.evaluate(FONTS)
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2400)
    R['geo']['1366_products'] = page.evaluate(GEO); R['typo']['1366_products'] = typo(page)
    R['teal']['1366_products'] = page.evaluate(TEAL)
    page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(2200)
    R['geo']['1366_taxo'] = page.evaluate(GEO)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2600)
    R['geo']['1366_pdp'] = page.evaluate(GEO); R['typo']['1366_pdp'] = typo(page)
    page.evaluate('location.hash = "#/products/633"'); page.wait_for_timeout(2600)
    R['geo']['1366_pdp_oos'] = page.evaluate(GEO)
    R['typo']['1366_pdp_oos'] = typo(page)
    for h, n in [('#/cart', 'cart'), ('#/checkout', 'checkout'), ('#/orders', 'orders'), ('#/notifications', 'notifs'), ('#/account', 'account')]:
        page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(2200)
        R['teal']['1366_' + n] = page.evaluate(TEAL)
        R['geo']['1366_' + n] = page.evaluate(OVERFLOW)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2500)
    page.click('#shop-add-to-cart'); page.wait_for_timeout(1300)
    R['teal']['1366_authdlg'] = page.evaluate(TEAL)
    R['geo']['1366_authdlg'] = page.evaluate(OVERFLOW)
    ctx.close()

    # ===== 390: هندسة + طباعة + أسطح جوال =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append(m.type + ':' + m.text[:110]) if m.type in ('error', 'warning') else None)
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(3000)
    R['fonts']['390'] = page.evaluate(FONTS)
    R['geo']['390_home'] = page.evaluate(GEO)
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2400)
    R['geo']['390_products'] = page.evaluate(GEO); R['typo']['390_products'] = typo(page)
    page.click('#shop-search-btn'); page.wait_for_timeout(900)
    page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1700)
    R['typo']['390_search'] = typo(page)
    page.keyboard.press('Escape'); page.wait_for_timeout(700)
    page.click('#shop-burger'); page.wait_for_timeout(900)
    R['typo']['390_menu'] = typo(page)
    page.keyboard.press('Escape'); page.wait_for_timeout(700)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2600)
    R['geo']['390_pdp'] = page.evaluate(GEO); R['typo']['390_pdp'] = typo(page)
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2300)
    page.evaluate("document.getElementById('shop-filters-toggle').click()"); page.wait_for_timeout(1000)
    R['geo']['390_filters'] = page.evaluate(GEO); R['typo']['390_filters'] = typo(page)
    page.keyboard.press('Escape'); page.wait_for_timeout(600)
    # 200% نص
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2300)
    R['zoom']['390_before'] = page.evaluate(OVERFLOW)
    page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(900)
    R['zoom']['390_products'] = page.evaluate(OVERFLOW)
    R['zoom']['390_geo'] = page.evaluate(GEO)
    page.evaluate("document.documentElement.style.fontSize = ''"); page.wait_for_timeout(500)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2400)
    page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(900)
    R['zoom']['390_pdp'] = page.evaluate(OVERFLOW)
    page.evaluate("document.documentElement.style.fontSize = ''"); page.wait_for_timeout(400)
    page.evaluate('location.hash = "#/"'); page.wait_for_timeout(2000)
    page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(900)
    R['zoom']['390_home'] = page.evaluate(OVERFLOW)
    page.evaluate("document.documentElement.style.fontSize = ''")
    ctx.close()

    # ===== مصفوفة 13 عرضًا =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append('mx:' + m.type + ':' + m.text[:100]) if m.type in ('error', 'warning') else None)
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1800)
    for w in [360, 390, 430, 600, 768, 769, 900, 1023, 1024, 1280, 1366, 1440, 1920]:
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(400)
        row = {}
        for n, h in [('home', '#/'), ('products', '#/products'), ('taxo', '#/products?view=categories'), ('pdp', '#/products/632'), ('pdp_oos', '#/products/633')]:
            page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(2100)
            row[n] = page.evaluate(OVERFLOW)
        R['matrix'][str(w)] = row
        print('%-5d home ov=%s h=%-5s | prod ov=%s clip=%s | taxo ov=%s | pdp ov=%s h=%-5s | oos ov=%s' % (
            w, row['home']['ov'], row['home']['docH'], row['products']['ov'], (row['products']['clipped'] or [])[:2],
            row['taxo']['ov'], row['pdp']['ov'], row['pdp']['docH'], row['pdp_oos']['ov']))
    # 200% على 768/1366
    for w in (768, 1366):
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(400)
        page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2200)
        base = page.evaluate(OVERFLOW)
        page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(900)
        R['zoom']['%d_products' % w] = {'before': base, 'after': page.evaluate(OVERFLOW)}
        R['zoom']['%d_geo' % w] = page.evaluate(GEO)
        page.evaluate("document.documentElement.style.fontSize = ''"); page.wait_for_timeout(300)
        print('zoom200 %-5d before ov=%s after ov=%s clipped=%s' % (w, base['ov'], R['zoom']['%d_products' % w]['after']['ov'],
              (R['zoom']['%d_products' % w]['after']['clipped'] or [])[:3]))
    ctx.close()
    b.close()

with open(os.path.join(OUT, 'measure-%s.json' % LABEL), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nconsole=%d failed=%d | cairo=%s qomra=%s' % (len(R['console']), len(R['failed']),
      R['fonts'].get('1366', {}).get('cairo_loaded'), R['fonts'].get('1366', {}).get('qomra_loaded')))
for k in ['1366_products', '1366_pdp', '390_products', '390_pdp', '390_home', '390_filters']:
    g = R['geo'].get(k) or {}
    print('%-14s ov=%s hdr=%s card=%s stage=%s cta=%s facts=%s crumbs=%s fsum=%s' % (k, g.get('ov'), g.get('hdr'), g.get('card'),
          (g.get('stage') or {}).get('w'), g.get('pdp_cta'), g.get('facts'), g.get('crumbs'), g.get('footer_sum')))
