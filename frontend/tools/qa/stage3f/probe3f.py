"""PHASE 3 · STEP 3F — قبل/بعد: النظام البصري للكتالوج + الثيم الداكن + الحالات.

الاستخدام: python3 probe3f.py before | after
قراءة فقط · بلا كتابة بيانات.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3f'
os.makedirs(OUT, exist_ok=True)
R = {'mode': MODE, 'console': [], 'failed': [], 'shots': []}

COLOR_JS = r"""
const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const p = m[1].split(',').map(x => parseFloat(x)); return {r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1}; };
const effBg = el => { let cur = el, stack = [];
  while (cur) { const c = parse(getComputedStyle(cur).backgroundColor); if (c && c.a > 0) stack.push(c); if (c && c.a >= 1) break; cur = cur.parentElement; }
  let base = {r: 255, g: 255, b: 255};
  for (let i = stack.length - 1; i >= 0; i--) { const s = stack[i];
    base = {r: s.r * s.a + base.r * (1 - s.a), g: s.g * s.a + base.g * (1 - s.a), b: s.b * s.a + base.b * (1 - s.a)}; }
  return base; };
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg), hi = Math.max(a, b), lo = Math.min(a, b);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };
const rgb = c => 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')';
const info = (sel, label) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) return null;
  const cs = getComputedStyle(el); const fg0 = parse(cs.color); const bg = effBg(el);
  const fg = fg0.a < 1 ? {r: fg0.r * fg0.a + bg.r * (1 - fg0.a), g: fg0.g * fg0.a + bg.g * (1 - fg0.a), b: fg0.b * fg0.a + bg.b * (1 - fg0.a)} : fg0;
  const b = el.getBoundingClientRect();
  return {label: label, text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
    color: cs.color, bgColor: cs.backgroundColor, effBg: rgb(bg), border: cs.borderTopColor,
    ratio: ratio(fg, bg), fontSize: cs.fontSize, fontWeight: cs.fontWeight,
    radius: cs.borderTopLeftRadius, shadow: cs.boxShadow.slice(0, 46),
    geom: {w: Math.round(b.width * 100) / 100, h: Math.round(b.height * 100) / 100}}; };
"""

MEASURE = "(() => {" + COLOR_JS + r"""
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const vis = el => { if (!el) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).display !== 'none'; };
  const tb = q('.shop-toolbar');
  const fields = qa('.shop-toolbar > .shop-toolbar__field');
  const ys = fields.map(f => Math.round(f.getBoundingClientRect().top));
  const rows = ys.reduce((a, y) => { if (!a.length || Math.abs(a[a.length - 1] - y) > 8) a.push(y); return a; }, []);
  const card = q('.shop-card');
  const taxo = q('.shop-taxonomy__item');
  const check = q('.shop-check');
  const checkInput = q('.shop-check input');
  const out = {
    theme: document.documentElement.getAttribute('data-theme'), vw: window.innerWidth,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    pageBg: getComputedStyle(document.body).backgroundColor,
    items: {
      toolbar: info('.shop-toolbar', 'الشريط'),
      toolbarLabel: info('.shop-toolbar__label', 'تسمية الحقل'),
      count: info('.shop-toolbar__count', 'عدّاد النتائج'),
      input: info('#shop-filter-search', 'حقل البحث'),
      select: info('#shop-filter-category', 'قائمة التصنيف'),
      priceMin: info('#shop-filter-minprice', 'حقل السعر'),
      check: check ? Object.assign(info(check, 'شريحة اختيار'), {checked: checkInput ? checkInput.checked : null,
        accent: checkInput ? getComputedStyle(checkInput).accentColor : null}) : null,
      crumbsLink: info('.shop-crumbs a', 'رابط المسار'),
      sectionLink: info('.shop-section__link', 'رابط عرض الكل'),
      cardName: info('.shop-card__name a', 'اسم المنتج'),
      cardBadge: info('.shop-card__flags .badge', 'شارة الخصم'),
      cardFootBadge: info('.shop-card__foot .badge', 'شارة التوفير'),
      cardAdd: info('.shop-card__add', 'زر أضف للسلة'),
      cardDetails: info('.shop-card__details', 'زر التفاصيل'),
      cardMeta: info('.shop-card__meta span', 'ميتا البطاقة'),
      cardPrice: info('.shop-price__now', 'السعر'),
      cardPriceWas: info('.shop-price__was', 'السعر القديم'),
      taxo: taxo ? info(taxo, 'بطاقة تصنيف') : null,
      taxoName: taxo ? info('.shop-taxonomy__name', 'اسم التصنيف') : null,
      taxoCount: taxo ? info('.shop-taxonomy__count', 'عدّاد التصنيف') : null,
      toggle: info('#shop-filters-toggle', 'زر الفلاتر'),
      sheet: info('.shop-filters__sheet', 'اللوحة'),
      sheetHead: info('.shop-filters__sheet-head', 'رأس اللوحة'),
      sheetFoot: info('.shop-filters__sheet-foot', 'قدم اللوحة'),
      sheetDone: info('.shop-filters__done', 'زر عرض النتائج'),
      sheetClear: info('.shop-filters__clear', 'زر تفريغ الفلاتر'),
      scrim: info('.shop-filters__scrim', 'الطبقة الخلفية'),
      state: info('#shop-view > .state', 'كتلة الحالة'),
      stateIcon: info('#shop-view > .state .state__icon', 'أيقونة الحالة'),
      stateTitle: info('#shop-view > .state .state__title', 'عنوان الحالة'),
      stateText: info('#shop-view > .state .state__text', 'نص الحالة'),
      stateBtn: info('#shop-view > .state .btn', 'زر الحالة'),
      skeleton: info('.skeleton--card', 'هيكل البطاقة'),
      skeletonTitle: info('.skeleton--title', 'هيكل العنوان')
    },
    geom: {
      toolbarH: tb ? Math.round(tb.getBoundingClientRect().height) : 0, toolbarRows: rows.length,
      toolbarCols: tb ? getComputedStyle(tb).gridTemplateColumns : null,
      card: card ? {w: Math.round(card.getBoundingClientRect().width), h: Math.round(card.getBoundingClientRect().height)} : null,
      taxo: taxo ? {w: Math.round(taxo.getBoundingClientRect().width), h: Math.round(taxo.getBoundingClientRect().height)} : null,
      badge: q('.shop-card__flags .badge') ? {w: Math.round(q('.shop-card__flags .badge').getBoundingClientRect().width), h: Math.round(q('.shop-card__flags .badge').getBoundingClientRect().height)} : null,
      add: q('.shop-card__add') ? {w: Math.round(q('.shop-card__add').getBoundingClientRect().width), h: Math.round(q('.shop-card__add').getBoundingClientRect().height)} : null,
      check: check ? {w: Math.round(check.getBoundingClientRect().width), h: Math.round(check.getBoundingClientRect().height)} : null,
      controlH: qa('.shop-toolbar input, .shop-toolbar select').map(c => Math.round(c.getBoundingClientRect().height)),
      state: q('#shop-view > .state') ? {w: Math.round(q('#shop-view > .state').getBoundingClientRect().width), h: Math.round(q('#shop-view > .state').getBoundingClientRect().height)} : null,
      gridCols: q('.shop-grid') ? getComputedStyle(q('.shop-grid')).gridTemplateColumns : null,
      cards: qa('.shop-card').length
    },
    focus: null
  };
  // حلقة التركيز: نطبّق :focus-visible على أول رابط في الكتالوج عبر لوحة المفاتيح
  return out;
})()"""

FOCUS_JS = r"""(() => {
  const el = document.querySelector('.shop-crumbs a') || document.querySelector('.shop-toolbar input') || document.querySelector('.shop-card__name a');
  if (!el) return null;
  el.focus();
  const cs = getComputedStyle(el);
  return {tag: el.tagName, cls: el.className, outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
    shadow: cs.boxShadow.slice(0, 60), outlineOffset: cs.outlineOffset};
})()"""


def shoot(page, name):
    p = os.path.join(OUT, '%s-%s.png' % (MODE, name))
    page.screenshot(path=p)
    R['shots'].append(p)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- A) المنتجات: عرض × ثيم ----------
    for w, theme in [(390, 'light'), (390, 'dark'), (769, 'light'), (1024, 'light'), (1366, 'light'), (1366, 'dark'), (1920, 'light')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'products'}) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:150]}))
        page.on('requestfailed', lambda r: R['failed'].append({'u': r.url[:110], 'r': str(r.failure)[:50]}))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1900)
        key = 'products_%d_%s' % (w, theme)
        R[key] = page.evaluate(MEASURE)
        R[key]['focus'] = page.evaluate(FOCUS_JS)
        # حالة checked لشريحة الاختيار
        try:
            page.check('#shop-filter-offers')
            page.wait_for_timeout(1700)
            R[key + '_checked'] = page.evaluate("""(() => { const c=document.querySelector('.shop-check');
              const i=c.querySelector('input'); const cs=getComputedStyle(c);
              return {checked:i.checked, bg:cs.backgroundColor, color:cs.color, border:cs.borderTopColor}; })()""")
        except Exception:
            R[key + '_checked'] = {'error': 'not-interactable'}
        shoot(page, 'products-%d-%s' % (w, theme))
        d = R[key]
        print('%-22s ov=%s toolbarH=%s rows=%s card=%s taxo=%s' % (key, d['overflow'], d['geom']['toolbarH'], d['geom']['toolbarRows'], d['geom']['card'], d['geom']['taxo']))
        ctx.close()

    # ---------- B) لوحة الفلاتر مفتوحة (390 light/dark) ----------
    for theme in ('light', 'dark'):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1800)
        page.click('#shop-filters-toggle')
        page.wait_for_timeout(800)
        R['sheet_390_' + theme] = page.evaluate(MEASURE)
        shoot(page, 'filters-390-%s' % theme)
        s = R['sheet_390_' + theme]['items']
        print('sheet %-5s: sheetBg=%s headBg=%s footBg=%s checkBg=%s doneBg=%s clearColor=%s' % (
            theme, s['sheet'] and s['sheet']['bgColor'], s['sheetHead'] and s['sheetHead']['bgColor'],
            s['sheetFoot'] and s['sheetFoot']['bgColor'], s['check'] and s['check']['bgColor'],
            s['sheetDone'] and s['sheetDone']['bgColor'], s['sheetClear'] and s['sheetClear']['color']))
        ctx.close()

    # ---------- C) التصنيفات والعلامات ----------
    for kind, hash_ in [('categories', '#/products?view=categories'), ('brands', '#/products?view=brands')]:
        for w, theme in [(390, 'light'), (390, 'dark'), (1366, 'light'), (1366, 'dark')]:
            ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
            if theme == 'dark':
                ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
            page = ctx.new_page()
            page.goto(SHOP, wait_until='load')
            page.wait_for_timeout(1400)
            page.evaluate('location.hash = "%s"' % hash_)
            page.wait_for_timeout(1800)
            key = '%s_%d_%s' % (kind, w, theme)
            R[key] = page.evaluate(MEASURE)
            R[key]['focus'] = page.evaluate("""(() => { const el=document.querySelector('.shop-taxonomy__item'); if(!el) return null;
              el.focus(); const cs=getComputedStyle(el); return {outline: cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor, border: cs.borderTopColor, shadow: cs.boxShadow.slice(0,50)}; })()""")
            shoot(page, '%s-%d-%s' % (kind, w, theme))
            t = R[key]['items']
            print('%-24s taxo bg=%s border=%s name=%s count=%s' % (key, t['taxo'] and t['taxo']['bgColor'], t['taxo'] and t['taxo']['border'],
                  t['taxoName'] and t['taxoName']['color'], t['taxoCount'] and t['taxoCount']['color']))
            ctx.close()

    # ---------- D) الحالات: فارغة + خطأ (light/dark) ----------
    for theme in ('light', 'dark'):
        for label, hash_, abort in [('empty', '#/products?minPrice=99999', False), ('error', '#/products', True)]:
            ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
            if theme == 'dark':
                ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
            page = ctx.new_page()
            page.goto(SHOP, wait_until='load')
            page.wait_for_timeout(1400)
            if abort:
                page.route('**/products?*', lambda r: r.abort())
            page.evaluate('location.hash = "%s"' % hash_)
            page.wait_for_timeout(2100)
            key = 'state_%s_%s' % (label, theme)
            R[key] = page.evaluate(MEASURE)
            shoot(page, '%s-%s' % (label, theme))
            s = R[key]['items']
            print('%-20s title=%s(%s) text=%s(%s) icon=%s btn=%s' % (key, s['stateTitle'] and s['stateTitle']['ratio'],
                  s['stateTitle'] and s['stateTitle']['color'], s['stateText'] and s['stateText']['ratio'],
                  s['stateText'] and s['stateText']['color'], s['stateIcon'] and s['stateIcon']['color'],
                  s['stateBtn'] and (s['stateBtn']['bgColor'], s['stateBtn']['ratio'])))
            ctx.close()

    # ---------- E) الهيكل (loading) ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.route('**/products?*', lambda route: None)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1500)
    R['loading_1366'] = page.evaluate(MEASURE)
    shoot(page, 'loading-1366')
    print('loading: skeleton=%s title=%s' % (R['loading_1366']['items']['skeleton'] and R['loading_1366']['items']['skeleton']['bgColor'],
          R['loading_1366']['items']['skeletonTitle'] and R['loading_1366']['items']['skeletonTitle']['bgColor']))
    ctx.close()

    # ---------- F) الفائض على كل العروض ----------
    ov = {}
    for w in (360, 390, 430, 600, 768, 769, 900, 1024, 1280, 1366, 1440, 1920):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1200)
        for label, hash_ in [('products', '#/products'), ('categories', '#/products?view=categories'), ('brands', '#/products?view=brands'), ('empty', '#/products?minPrice=99999')]:
            page.evaluate('location.hash = "%s"' % hash_)
            page.wait_for_timeout(1500)
            ov['%s_%d' % (label, w)] = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        ctx.close()
    R['overflow'] = ov
    print('overflow max:', max(ov.values()))

    # ---------- G) انحدار 3C + 3B + Home/Header/Menu/Search ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    reg = {}
    for label, hash_, expect in [('none', '#/products', 2), ('minPrice400', '#/products?minPrice=400', 1),
                                 ('maxPrice400', '#/products?maxPrice=400', 1), ('min99999', '#/products?minPrice=99999', 0),
                                 ('offers', '#/products?offers=1', 1), ('instock', '#/products?inStock=1', 2), ('page2', '#/products?page=2', 2)]:
        page.evaluate('location.hash = "%s"' % hash_)
        page.wait_for_timeout(1900)
        reg[label] = page.evaluate("""(() => ({hash: location.hash, cards: document.querySelectorAll('.shop-card').length,
          count: (document.querySelector('.shop-toolbar__count')||{}).textContent}))()""")
        print('reg3c %-12s cards=%s (متوقع %s) count=%s hash=%s' % (label, reg[label]['cards'], expect, reg[label]['count'], reg[label]['hash']))
    R['reg3c'] = reg
    ctx.close()

    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1900)
    R['reg390'] = page.evaluate("""(() => ({homeCards: document.querySelectorAll('#shop-view .shop-card').length,
      hero: !!document.querySelector('.shop-home-slider, .shop-hero'),
      headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    R['reg390']['listingCard'] = page.evaluate("""(() => { const b=document.querySelector('.shop-card').getBoundingClientRect();
      return {w: Math.round(b.width), h: Math.round(b.height)}; })()""")
    page.click('#shop-search-btn')
    page.wait_for_timeout(1100)
    R['reg390']['searchSheet'] = page.evaluate("""(() => { const s=document.getElementById('shop-search-sheet');
      return {top: Math.round(s.getBoundingClientRect().top), bg: getComputedStyle(s).backgroundColor}; })()""")
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)
    page.click('#shop-burger')
    page.wait_for_timeout(700)
    R['reg390']['menu'] = page.evaluate("""(() => ({rowH: Math.round(document.querySelector('.shop-drawer__link').getBoundingClientRect().height),
      drawerTop: Math.round(document.getElementById('shop-drawer').getBoundingClientRect().top)}))()""")
    print('reg390:', json.dumps(R['reg390'], ensure_ascii=False))
    ctx.close()
    b.close()

with open(os.path.join(OUT, 'probe3f-%s.json' % MODE), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n%s: console=%d failed=%d shots=%d' % (MODE, len(R['console']), len(R['failed']), len(R['shots'])))
