"""PHASE 2 · STEP 2C — قياس هيدر الجوال (قبل/بعد) + لقطات + انحدارات.

الاستخدام:
    python3 measure.py before
    python3 measure.py after

يقيس لكل مقاس: ارتفاع الهيدر · هدف الشعار · صورة الشعار · أزرار (قائمة/سلة/بحث)
· padding · gap · بصمة computed styles · الفائض الأفقي.
ثم: sticky (0/600/1200/نهاية) · أعلى القائمة · أعلى لوحة البحث · لقطات.
لا يكتب أي بيانات على الـAPI (تصفّح فقط).
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage2c'
os.makedirs(OUT, exist_ok=True)

SIZES = [360, 390, 430, 600, 768, 1024, 1366, 1920]
report = {'tag': TAG, 'url': SHOP, 'sizes': {}, 'sticky': {}, 'menu': {}, 'search': {},
          'console_errors': [], 'shots': []}

PROPS_BTN = ['width', 'height', 'background-color', 'color', 'border-top-width',
             'border-top-style', 'border-top-color', 'border-radius']
PROPS_HEADER = ['background-color', 'border-bottom-width', 'border-bottom-color',
                'box-shadow', 'position', 'backdrop-filter', 'height']

MEASURE = """(() => {
  const px = v => Math.round(v * 100) / 100;
  const rect = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {x: px(b.x), y: px(b.y), w: px(b.width), h: px(b.height), bottom: px(b.bottom)}; };
  const css = (el, props) => { if (!el) return null; const c = getComputedStyle(el); const o = {};
    props.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
  const q = s => document.querySelector(s);
  const header = q('.shop-header');
  const inner = q('.shop-header__inner');
  const brand = q('.shop-header .shop-brand');
  const logo = q('.shop-brand__logo');
  const search = q('#shop-search-btn');
  const cart = q('#shop-cart-button');
  const burger = q('#shop-burger');
  const actions = q('#shop-actions');
  const strong = q('.shop-brand__text strong');
  const small = q('.shop-brand__text small');
  const divider = q('.shop-header__divider');
  const badge = q('.shop-cartbtn__badge');
  return {
    header: rect(header),
    headerCss: css(header, ['background-color', 'border-bottom-width', 'border-bottom-color',
                            'box-shadow', 'position', 'backdrop-filter', 'height']),
    headerClass: header ? header.className : null,
    inner: rect(inner),
    innerCss: css(inner, ['padding-inline-start', 'padding-inline-end', 'gap', 'height', 'min-height']),
    brand: rect(brand),
    logo: rect(logo),
    logoCss: css(logo, ['width', 'height', 'border-radius']),
    brandText: strong ? {text: strong.textContent.trim(),
      css: css(strong, ['font-size', 'font-weight', 'white-space', 'overflow', 'text-overflow'])} : null,
    brandSmall: small ? {text: small.textContent.trim(),
      css: css(small, ['font-size', 'display'])} : null,
    divider: divider ? {rect: rect(divider), display: getComputedStyle(divider).display} : null,
    searchBtn: rect(search), searchCss: css(search, ['width', 'height', 'background-color', 'color',
      'border-top-width', 'border-top-color', 'border-radius']),
    searchIcon: search ? rect(search.querySelector('svg')) : null,
    cartBtn: rect(cart), cartCss: css(cart, ['width', 'height', 'background-color', 'color',
      'border-top-width', 'border-top-color', 'border-radius']),
    cartIcon: cart ? rect(cart.querySelector('svg')) : null,
    cartBadge: badge ? {rect: rect(badge), css: css(badge, ['background-color', 'color', 'border-top-color',
      'min-width', 'height', 'font-size'])} : null,
    burgerBtn: rect(burger), burgerCss: css(burger, ['width', 'height', 'background-color', 'color',
      'border-top-width', 'border-top-color', 'border-radius']),
    burgerBars: burger ? rect(burger.querySelector('.shop-burger')) : null,
    actionsCss: css(actions, ['gap']),
    varHdrTop: getComputedStyle(document.body).getPropertyValue('--hdrmenu-top').trim(),
    varHdrHeight: getComputedStyle(document.body).getPropertyValue('--shop-header-height').trim(),
    varHdrGap: getComputedStyle(document.body).getPropertyValue('--hdr-gap').trim(),
    overflow: {docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth,
               bodySW: document.body.scrollWidth, bodyCW: document.body.clientWidth},
    dpr: window.devicePixelRatio,
    fonts: document.fonts ? document.fonts.status : 'n/a'
  };
})()"""

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- 1) قياس كل المقاسات ----------
    for w in SIZES:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar',
                            device_scale_factor=2 if w < 768 else 1)
        page = ctx.new_page()
        page.on('console', lambda m: report['console_errors'].append('console: ' + m.text)
                if m.type == 'error' else None)
        page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1800)
        data = page.evaluate(MEASURE)
        report['sizes'][str(w)] = data
        if w in (360, 390, 1366):
            p = os.path.join(OUT, '%s-%d-top.png' % (TAG, w))
            page.screenshot(path=p)
            report['shots'].append(p)
        print('== %dpx == header=%s brand=%s logo=%s search=%s cart=%s burger=%s ov=%s' % (
            w, data['header'] and data['header']['h'], data['brand'] and data['brand']['w'],
            data['logo'] and data['logo']['w'], data['searchBtn'] and data['searchBtn']['w'],
            data['cartBtn'] and data['cartBtn']['w'], data['burgerBtn'] and data['burgerBtn']['w'],
            data['overflow']['docSW'] - data['overflow']['docCW']))
        ctx.close()

    # ---------- 2) sticky + القائمة + البحث على 390 ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.on('console', lambda m: report['console_errors'].append('console: ' + m.text)
            if m.type == 'error' else None)
    page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(2000)

    max_scroll = page.evaluate('document.documentElement.scrollHeight - window.innerHeight')
    for y in [0, 600, 1200, int(max_scroll)]:
        page.evaluate('window.scrollTo(0, %d)' % y)
        page.wait_for_timeout(400)
        report['sticky'][str(y)] = page.evaluate("""(() => {
          const h = document.querySelector('.shop-header');
          const b = h.getBoundingClientRect();
          return {scrollY: Math.round(window.scrollY), headerTop: Math.round(b.top),
                  headerBottom: Math.round(b.bottom), height: Math.round(b.height),
                  isScrolled: h.classList.contains('is-scrolled'),
                  boxShadow: getComputedStyle(h).boxShadow,
                  background: getComputedStyle(h).backgroundColor};
        })()""")
        print('sticky', y, report['sticky'][str(y)])

    # لقطة بعد scroll 1200
    page.evaluate('window.scrollTo(0, 1200)')
    page.wait_for_timeout(500)
    p = os.path.join(OUT, '%s-390-scroll1200.png' % TAG)
    page.screenshot(path=p)
    report['shots'].append(p)

    # ---------- 3) القائمة مفتوحة ----------
    page.evaluate('window.scrollTo(0, 0)')
    page.wait_for_timeout(300)
    page.click('#shop-burger')
    page.wait_for_timeout(500)
    page.mouse.move(195, 700)          # إبعاد المؤشر: قياس حالة «مفتوح» لا «hover»
    page.wait_for_timeout(300)
    report['menu'] = page.evaluate("""(() => {
      const h = document.querySelector('.shop-header');
      const d = document.getElementById('shop-drawer');
      const hb = h.getBoundingClientRect(), db = d.getBoundingClientRect();
      const b = document.getElementById('shop-burger');
      const cs = getComputedStyle(b);
      return {headerBottom: Math.round(hb.bottom), drawerTop: Math.round(db.top),
              diff: Math.round(db.top - hb.bottom), open: d.classList.contains('is-open'),
              burgerAria: b.getAttribute('aria-expanded'), burgerBg: cs.backgroundColor,
              burgerColor: cs.color, burgerShadow: cs.boxShadow, burgerBorder: cs.borderTopColor};
    })()""")
    print('menu', report['menu'])
    p = os.path.join(OUT, '%s-390-menu.png' % TAG)
    page.screenshot(path=p)
    report['shots'].append(p)

    # بعد scroll 1200 والقائمة مفتوحة
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.evaluate('window.scrollTo(0, 1200)')
    page.wait_for_timeout(300)
    page.click('#shop-burger')
    page.wait_for_timeout(700)
    report['menu_scrolled'] = page.evaluate("""(() => {
      const h = document.querySelector('.shop-header');
      const d = document.getElementById('shop-drawer');
      const hb = h.getBoundingClientRect(), db = d.getBoundingClientRect();
      return {scrollY: Math.round(window.scrollY), headerTop: Math.round(hb.top),
              headerBottom: Math.round(hb.bottom), drawerTop: Math.round(db.top),
              diff: Math.round(db.top - hb.bottom)};
    })()""")
    print('menu_scrolled', report['menu_scrolled'])
    page.keyboard.press('Escape')
    page.wait_for_timeout(600)

    # ---------- 4) لوحة البحث ----------
    page.evaluate('window.scrollTo(0, 0)')
    page.wait_for_timeout(300)
    page.click('#shop-search-btn')
    page.wait_for_timeout(500)
    page.mouse.move(195, 700)          # إبعاد المؤشر: قياس حالة «مفتوح» لا «hover»
    page.wait_for_timeout(300)
    report['search'] = page.evaluate("""(() => {
      const h = document.querySelector('.shop-header');
      const s = document.getElementById('shop-search-sheet');
      const hb = h.getBoundingClientRect(), sb = s.getBoundingClientRect();
      const b = document.getElementById('shop-search-btn');
      const cs = getComputedStyle(b);
      return {headerBottom: Math.round(hb.bottom), sheetTop: Math.round(sb.top),
              diff: Math.round(sb.top - hb.bottom), open: s.classList.contains('is-open'),
              sheetBg: cs.backgroundColor, sheetColor: cs.color, sheetBorder: cs.borderTopColor,
              liveRole: !!s.querySelector('[role=status]'),
              liveAttrs: (() => { const n = s.querySelector('[role=status]');
                return n ? {live: n.getAttribute('aria-live'), atomic: n.getAttribute('aria-atomic')} : null; })()};
    })()""")
    print('search', report['search'])
    p = os.path.join(OUT, '%s-390-search.png' % TAG)
    page.screenshot(path=p)
    report['shots'].append(p)

    # إتاحة البحث (مقفلة من STEP 2B): عنصر role=status بعد تنفيذ بحث فعلي
    page.fill('#shop-search-sheet-input', 'لمبة')
    page.wait_for_timeout(2400)
    report['search_a11y'] = page.evaluate("""(() => Array.from(document.querySelectorAll('[role=status]')).map(n => ({
        cls: n.className, live: n.getAttribute('aria-live'), atomic: n.getAttribute('aria-atomic'),
        text: (n.textContent || '').slice(0, 50)})))()""")
    print('search_a11y', report['search_a11y'])

    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.evaluate('window.scrollTo(0, 1200)')
    page.wait_for_timeout(300)
    page.click('#shop-search-btn')
    page.wait_for_timeout(700)
    report['search_scrolled'] = page.evaluate("""(() => {
      const h = document.querySelector('.shop-header');
      const s = document.getElementById('shop-search-sheet');
      const hb = h.getBoundingClientRect(), sb = s.getBoundingClientRect();
      return {scrollY: Math.round(window.scrollY), headerTop: Math.round(hb.top),
              headerBottom: Math.round(hb.bottom), sheetTop: Math.round(sb.top),
              diff: Math.round(sb.top - hb.bottom)};
    })()""")
    print('search_scrolled', report['search_scrolled'])
    report['search_scrolled']['strip'] = page.evaluate("""(() => {
      const pts = [];
      for (const y of [5, 20, 40, 60, 72]) {
        const el = document.elementFromPoint(195, y);
        pts.push([y, el ? (el.tagName + '.' + String(el.className).slice(0, 30)) : 'null']);
      }
      return pts; })()""")
    print('search_scrolled strip', report['search_scrolled']['strip'])
    p = os.path.join(OUT, '%s-390-search-scroll1200.png' % TAG)
    page.screenshot(path=p)
    report['shots'].append(p)
    page.keyboard.press('Escape')
    page.wait_for_timeout(600)

    # ---------- 5) حلقة التركيز (كيبورد) على زر القائمة ----------
    page.evaluate('window.scrollTo(0, 0)')
    page.wait_for_timeout(300)
    focused = None
    for _ in range(20):
        page.keyboard.press('Tab')
        page.wait_for_timeout(80)
        focused = page.evaluate("document.activeElement ? document.activeElement.id || document.activeElement.className : ''")
        if focused == 'shop-burger':
            break
    report['focus'] = page.evaluate("""(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      return {id: el.id, cls: el.className, outline: cs.outlineStyle + ' ' + cs.outlineWidth,
              boxShadow: cs.boxShadow, bg: cs.backgroundColor, color: cs.color};
    })()""")
    print('focus', report['focus'])
    p = os.path.join(OUT, '%s-390-focus.png' % TAG)
    page.screenshot(path=p)
    report['shots'].append(p)
    ctx.close()
    b.close()

path = os.path.join(OUT, 'measure-%s.json' % TAG)
with open(path, 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print('\nreport:', path)
print('console errors:', len(report['console_errors']))
for e in report['console_errors'][:10]:
    print('  !', e)
