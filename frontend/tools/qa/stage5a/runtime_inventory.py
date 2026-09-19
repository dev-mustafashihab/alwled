"""PHASE 5 · 5A — جرد وقت-تشغيل: طباعة/عناصر تحكم/ألوان في كل أسطح المتجر + مصفوفة استجابة."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage5a'
os.makedirs(OUT, exist_ok=True)
R = {'console': [], 'failed': [], 'surfaces': {}, 'controls': {}, 'matrix': {}, 'a11y': {}}

TYPO = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'color', 'backgroundColor',
        'borderRadius', 'borderColor', 'borderWidth', 'boxShadow', 'height', 'minHeight', 'padding', 'gap']

SEL = {
  'header': ['.shop-header__inner', '.shop-brand__text strong', '.shop-nav__link', '.shop-iconbtn', '.shop-cartbtn', '.shop-search__input'],
  'crumbs': ['.shop-crumbs a'],
  'section': ['.shop-section__title', '.shop-section__sub', '.shop-section__link'],
  'product_card': ['.shop-card', '.shop-card__meta', '.shop-card__name', '.shop-price__now', '.shop-price__was', '.shop-card__add', '.shop-card .badge'],
  'toolbar': ['.shop-toolbar__label', '.shop-toolbar__count', '#shop-filter-search', '#shop-filter-category', '.shop-check'],
  'filters': ['.shop-filters__toggle', '.shop-filters__sheet', '.shop-filters__done', '.shop-filters__clear'],
  'pdp': ['.shop-gallery__stage', '.shop-buy__title', '.shop-buy__price .shop-price__now', '.shop-buy__facts .shop-fact__label',
          '.shop-buy__facts .shop-fact__value', '.shop-buy__actions .btn--primary', '#shop-qty', '.shop-qty__btn', '.shop-panel__title', '.shop-prose'],
  'home': ['.shop-hero__title', '.shop-home-ticker', '.shop-home .shop-card__name', '.shop-home .shop-card__add'],
  'states': ['.state__title', '.state__text', '.state .btn'],
  'footer': ['.shop-footer', '.shop-footer a', '.shop-footer__sec summary'],
  'search': ['.shop-search-sheet', '.shop-search-sheet__input', '.shop-search-row', '.shop-search-row__name', '.shop-search-row__price'],
  'menu': ['.shop-drawer__panel', '.shop-drawer__link', '.shop-drawer__group-title'],
  'taxonomy': ['#shop-view > .shop-taxonomy > .shop-taxonomy__item', '.shop-taxonomy__name', '.shop-taxonomy__count'],
}

JS = r"""(sel) => {
  const out = {};
  sel.forEach(s => {
    const el = document.querySelector(s);
    if (!el) { out[s] = null; return; }
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const o = { box: Math.round(b.width) + 'x' + Math.round(b.height) };
    %s.forEach(p => { o[p] = cs[p]; });
    out[s] = o;
  });
  return out;
}""" % json.dumps(TYPO)

OVERFLOW = r"""(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  docH: Math.round(document.documentElement.scrollHeight),
  vw: window.innerWidth,
  clipped: Array.from(document.querySelectorAll('#shop-view *, .shop-header *, .shop-footer *')).filter(el => {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const b = el.getBoundingClientRect(); if (!b.width || !b.height) return false;
    return el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && !el.classList.contains('shop-crumbs');
  }).slice(0, 6).map(el => String(el.className).slice(0, 30) + '|' + (el.textContent || '').trim().slice(0, 18))
}))()"""

SMALL = r"""(() => {
  const out = [];
  Array.from(document.querySelectorAll('#shop-view a, #shop-view button, #shop-view input, #shop-view select, .shop-header button, .shop-header a, .shop-drawer button, .shop-drawer a'))
    .forEach(el => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!b.width || !b.height || cs.display === 'none' || cs.visibility === 'hidden') return;
      if (b.width < 44 || b.height < 44) out.push({ tag: el.tagName, cls: String(el.className).slice(0, 26), text: (el.textContent || '').trim().slice(0, 16),
        box: Math.round(b.width) + 'x' + Math.round(b.height) }); });
  const seen = {}; return out.filter(o => { const k = o.cls + o.text; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 14);
})()"""


def collect(page, key, sel):
    R['surfaces'][key] = page.evaluate(JS, sel)
    R['surfaces'][key]['_overflow'] = page.evaluate(OVERFLOW)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ===== أسطح المتجر (390 و1366 فاتح + 1366 داكن) =====
    for w, theme in [(390, 'light'), (1366, 'light'), (1366, 'dark')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:130]}) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:130]}))
        page.on('requestfailed', lambda r: R['failed'].append(r.url[-50:]))
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(3200)
        k = '%d_%s' % (w, theme)
        collect(page, k + '_home', SEL['header'] + SEL['crumbs'] + SEL['section'] + SEL['home'] + SEL['footer'])
        page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2300)
        collect(page, k + '_products', SEL['header'] + SEL['crumbs'] + SEL['section'] + SEL['product_card'] + SEL['toolbar'] + SEL['footer'])
        R['controls'][k + '_products'] = page.evaluate(SMALL)
        page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(2200)
        collect(page, k + '_taxonomy', SEL['taxonomy'] + SEL['crumbs'])
        page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2600)
        collect(page, k + '_pdp', SEL['pdp'] + SEL['crumbs'] + SEL['product_card'])
        page.evaluate('location.hash = "#/"'); page.wait_for_timeout(2000)
        # البحث + القائمة (أسطح جوال فقط: مخفية عند ≥1024)
        if w <= 1023:
            page.click('#shop-search-btn'); page.wait_for_timeout(800)
            page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1600)
            collect(page, k + '_search', SEL['search'])
            page.keyboard.press('Escape'); page.wait_for_timeout(700)
            page.click('#shop-burger'); page.wait_for_timeout(900)
            collect(page, k + '_menu', SEL['menu'])
            page.keyboard.press('Escape'); page.wait_for_timeout(700)
        if w == 390:
            page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2200)
            page.evaluate("document.getElementById('shop-filters-toggle').click()"); page.wait_for_timeout(900)
            collect(page, k + '_filters', SEL['filters'] + SEL['toolbar'])
        ctx.close()

    # ===== الحالات: فارغ/خطأ (390) =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1600)
    page.evaluate('location.hash = "#/products?minPrice=99999"'); page.wait_for_timeout(2300)
    collect(page, '390_empty', SEL['states'])
    ctx.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.route('**/api/v1/products*', lambda r: r.abort())
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1600)
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2300)
    collect(page, '390_error', SEL['states'])
    ctx.close()

    # ===== مصفوفة استجابة مصغّرة (13 عرضًا × صفحات) =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:130], 'k': 'matrix'}) if m.type in ('error', 'warning') else None)
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1800)
    for w in [360, 390, 430, 600, 768, 769, 900, 1023, 1024, 1280, 1366, 1440, 1920]:
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(350)
        row = {}
        for name, h in [('home', '#/'), ('products', '#/products'), ('taxonomy', '#/products?view=categories'), ('pdp', '#/products/632')]:
            page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(2200)
            row[name] = page.evaluate(OVERFLOW)
        R['matrix'][str(w)] = row
        print('%-5d home ov=%s docH=%-5s | products ov=%s | taxo ov=%s | pdp ov=%s docH=%-5s clipped=%s' % (
            w, row['home']['ov'], row['home']['docH'], row['products']['ov'], row['taxonomy']['ov'], row['pdp']['ov'], row['pdp']['docH'],
            (row['products']['clipped'] or [])[:2]))
    # تكبير النص 200%
    for w in (390, 1366):
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(300)
        page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2200)
        base = page.evaluate(OVERFLOW)
        page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(700)
        R['a11y']['zoom200_%d' % w] = {'before': base, 'after': page.evaluate(OVERFLOW)}
        print('zoom200 %-5d before ov=%s after ov=%s clipped=%s' % (w, base['ov'], R['a11y']['zoom200_%d' % w]['after']['ov'], (R['a11y']['zoom200_%d' % w]['after']['clipped'] or [])[:3]))
        page.evaluate("document.documentElement.style.fontSize = ''")
    ctx.close()

    b.close()

with open(os.path.join(OUT, 'runtime-inventory.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nconsole=%d failed=%d' % (len(R['console']), len(R['failed'])))
