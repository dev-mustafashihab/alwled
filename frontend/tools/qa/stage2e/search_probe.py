"""PHASE 2 · STEP 2E — قياس لوحة البحث (قبل/بعد).

الاستخدام: python3 search_probe.py before|after
يغطي: initial/suggestions · loading · results (2) · single · empty · error · dark · focus ·
التمرير · الانحدار الوظيفي · الفائض · لقطات. لا يكتب أي بيانات (تصفّح فقط).
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage2e'
os.makedirs(OUT, exist_ok=True)

Q_MULTI = 'ثلاجة'      # 2 نتائج (كل منتجات المتجر)
Q_SINGLE = '500'       # نتيجة واحدة
Q_NONE = 'لمبة'        # بلا نتائج

report = {'tag': TAG, 'states': {}, 'functional': {}, 'net': {}, 'console_errors': [], 'shots': []}

JS = """(() => {
  const px = v => Math.round(v);
  const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {top: px(b.top), bottom: px(b.bottom), h: px(b.height), w: px(b.width), x: px(b.x), y: px(b.y)}; };
  const C = (el, ps) => { if (!el) return null; const c = getComputedStyle(el); const o = {};
    ps.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const sheet = q('#shop-search-sheet');
  const head = q('.shop-search-sheet__head');
  const field = q('.shop-search-sheet__field');
  const icon = q('.shop-search-sheet__field-icon');
  const input = q('#shop-search-sheet-input');
  const clear = q('#shop-search-clear');
  const close = q('#shop-search-close');
  const body = q('.shop-search-sheet__body');
  const label = q('.shop-search-sheet__label');
  const sugSection = q('#shop-search-suggest');
  const sugList = q('#shop-search-suggest-list');
  const chips = qa('.shop-search-chip');
  const results = qa('.shop-search-row');
  const resultsBox = q('#shop-search-results');
  const skel = qa('.shop-search-skeleton');
  const state = q('.shop-search-state');
  const viewportH = window.innerHeight;
  const bodyBox = body ? body.getBoundingClientRect() : null;
  const visibleRows = results.filter(r => { const b = r.getBoundingClientRect();
    return bodyBox && b.top >= bodyBox.top - 0.5 && b.bottom <= bodyBox.bottom + 0.5; }).length;
  const firstRow = results[0];
  const media = q('.shop-search-row__media');
  const name = q('.shop-search-row__name');
  const meta = q('.shop-search-row__meta');
  const price = q('.shop-search-row__price');
  const live = qa('[role=status]').map(n => ({cls: n.className, live: n.getAttribute('aria-live'),
    atomic: n.getAttribute('aria-atomic'), text: (n.textContent || '').trim().slice(0, 40)}));
  const rowGap = results.length > 1 ? px(results[1].getBoundingClientRect().top - results[0].getBoundingClientRect().bottom) : null;
  return {
    viewport: {w: window.innerWidth, h: viewportH},
    sheet: R(sheet), sheetCss: C(sheet, ['position', 'top', 'bottom', 'background-color', 'opacity', 'z-index']),
    head: R(head), headCss: C(head, ['padding', 'gap', 'background-color', 'border-bottom-width', 'border-bottom-color']),
    field: R(field),
    icon: R(icon), iconCss: C(icon, ['color', 'inset-inline-start']),
    iconSvg: (() => { const s = q('.shop-search-sheet__field-icon svg'); return s ? R(s) : null; })(),
    input: R(input), inputCss: C(input, ['height', 'font-size', 'padding-inline-start', 'padding-inline-end',
      'background-color', 'color', 'border-top-width', 'border-top-color', 'border-radius', 'outline-style']),
    clear: clear ? {rect: R(clear), hidden: clear.hidden, css: C(clear, ['width', 'height', 'color', 'background-color', 'border-radius', 'inset-inline-end'])} : null,
    close: R(close), closeCss: C(close, ['width', 'height', 'background-color', 'color', 'border-top-width', 'border-top-color', 'border-radius']),
    body: R(body), bodyCss: C(body, ['overflow-y', 'padding', 'background-color']),
    bodyScroll: body ? {clientH: px(body.clientHeight), contentH: px(body.scrollHeight), maxScroll: px(body.scrollHeight - body.clientHeight)} : null,
    label: label ? {rect: R(label), css: C(label, ['font-size', 'font-weight', 'color', 'letter-spacing', 'text-transform', 'margin'])} : null,
    sugSection: sugSection ? {hidden: sugSection.hidden, rect: R(sugSection)} : null,
    chips: chips.length, chip0: chips[0] ? {rect: R(chips[0]), css: C(chips[0], ['min-height', 'padding', 'background-color', 'color', 'border-radius', 'font-size', 'border-top-color'])} : null,
    resultsCount: results.length, visibleRowsInBody: visibleRows,
    row0: firstRow ? {rect: R(firstRow), css: C(firstRow, ['min-height', 'grid-template-columns', 'gap', 'padding',
      'border-top-width', 'border-top-color', 'border-radius', 'background-color', 'box-shadow', 'text-decoration-line'])} : null,
    rowGap: rowGap,
    media: media ? {rect: R(media), css: C(media, ['width', 'height', 'background-color', 'border-radius', 'object-fit', 'overflow'])} : null,
    mediaImg: (() => { const i = q('.shop-search-row__media img'); return i ? {rect: R(i), css: C(i, ['object-fit', 'width', 'height'])} : null; })(),
    mediaSvg: (() => { const s = q('.shop-search-row__media svg'); return s ? R(s) : null; })(),
    name: name ? {text: name.textContent.trim(), rect: R(name), css: C(name, ['font-size', 'font-weight', 'color', 'line-clamp', '-webkit-line-clamp', 'display'])} : null,
    meta: meta ? {text: meta.textContent.trim(), rect: R(meta), css: C(meta, ['font-size', 'color', 'white-space', 'overflow'])} : null,
    price: price ? {text: price.textContent.trim(), rect: R(price), css: C(price, ['font-size', 'font-weight', 'color'])} : null,
    oldPrice: !!q('.shop-search-row__old, .shop-search-row__compare, s'),
    skeletons: skel.length, skel0: skel[0] ? {rect: R(skel[0]), css: C(skel[0], ['height', 'border-radius', 'background-color', 'background-image', 'animation-name', 'border-top-width'])} : null,
    state: state ? {rect: R(state), css: C(state, ['padding', 'border-top-width', 'border-top-style', 'border-top-color', 'border-radius', 'background-color', 'text-align']),
      title: (() => { const t = q('.shop-search-state__title'); return t ? {text: t.textContent.trim(), css: C(t, ['font-size', 'font-weight', 'color'])} : null; })(),
      text: (() => { const t = q('.shop-search-state__text'); return t ? {text: t.textContent.trim().slice(0, 60), css: C(t, ['font-size', 'color'])} : null; })(),
      icon: (() => { const i = q('.shop-search-state__icon'); return i ? {rect: R(i), color: getComputedStyle(i).color, svgCls: (i.querySelector('svg') || {}).className || null} : null; })(),
      cta: (() => { const c = q('.shop-search-state .btn'); return c ? {text: c.textContent.trim(), rect: R(c), css: C(c, ['min-height', 'background-color', 'color', 'border-radius', 'font-size'])} : null; })() } : null,
    liveRegions: live,
    overflow: {doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
               sheet: sheet.scrollWidth - sheet.clientWidth, body: body.scrollWidth - body.clientWidth},
    pageScrollY: px(window.scrollY),
    bodyLock: {body: getComputedStyle(document.body).overflowY, html: getComputedStyle(document.documentElement).overflowY},
    activeEl: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null
  };
})()"""


def shoot(page, name):
    p = os.path.join(OUT, '%s-%s.png' % (TAG, name))
    page.screenshot(path=p)
    report['shots'].append(p)
    return p


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- 1) initial + results + single + empty (390×844) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.on('console', lambda m: report['console_errors'].append('console: ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
    reqs = []
    page.on('request', lambda r: reqs.append((time.time(), r.url)) if '/products' in r.url and 'search=' in r.url else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1700)
    page.click('#shop-search-btn')
    page.wait_for_timeout(1500)
    report['states']['initial'] = page.evaluate(JS)
    shoot(page, '390-initial')
    # autofocus + debounce timing
    focused = page.evaluate("document.activeElement && document.activeElement.id")
    t0 = time.time()
    page.type('#shop-search-sheet-input', Q_MULTI, delay=60)
    page.wait_for_timeout(1600)
    debounce_ms = None
    for ts, url in reqs:
        if 'search=' in url:
            debounce_ms = int((ts - t0) * 1000)
            break
    report['functional']['autofocus'] = focused
    report['functional']['debounce_first_request_ms'] = debounce_ms
    report['states']['results_multi'] = page.evaluate(JS)
    shoot(page, '390-results')
    # scrolled results
    page.evaluate("""(() => { const b = document.querySelector('.shop-search-sheet__body');
      if (b) b.scrollTop = b.scrollHeight; })()""")
    page.wait_for_timeout(400)
    report['states']['results_scrolled'] = page.evaluate(JS)
    shoot(page, '390-results-scrolled')
    page.evaluate("""(() => { const b = document.querySelector('.shop-search-sheet__body'); if (b) b.scrollTop = 0; })()""")
    # clear button (after typing)
    report['functional']['clear_visible'] = page.evaluate("""(() => { const c = document.getElementById('shop-search-clear');
      return {hidden: c.hidden, rect: (() => { const b = c.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height)}; })()}; })()""")
    page.click('#shop-search-clear')
    page.wait_for_timeout(700)
    report['functional']['after_clear'] = page.evaluate("""(() => ({value: document.getElementById('shop-search-sheet-input').value,
      clearHidden: document.getElementById('shop-search-clear').hidden,
      chipsBack: !!document.querySelector('.shop-search-chip'),
      resultsCount: document.querySelectorAll('.shop-search-row').length,
      focused: document.activeElement && document.activeElement.id}))()""")
    # single result
    page.type('#shop-search-sheet-input', Q_SINGLE, delay=50)
    page.wait_for_timeout(1500)
    report['states']['results_single'] = page.evaluate(JS)
    shoot(page, '390-results-single')
    # empty
    page.fill('#shop-search-sheet-input', '')
    page.wait_for_timeout(500)
    page.type('#shop-search-sheet-input', Q_NONE, delay=40)
    page.wait_for_timeout(1600)
    report['states']['empty'] = page.evaluate(JS)
    shoot(page, '390-empty')
    # Escape + focus return
    page.keyboard.press('Escape')
    page.wait_for_timeout(600)
    report['functional']['escape'] = page.evaluate("""(() => ({hidden: document.getElementById('shop-search-sheet').hidden,
      open: document.getElementById('shop-search-sheet').classList.contains('is-open'),
      active: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null,
      bodyLock: getComputedStyle(document.body).overflowY, pageScrollY: Math.round(window.scrollY)}))()""")
    ctx.close()

    # ---------- 2) loading (طلب معلّق) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1600)
    page.click('#shop-search-btn')
    page.wait_for_timeout(900)
    page.route('**/products?*search=*', lambda route: None)      # تعليق الطلب ⇒ تبقى حالة التحميل
    page.type('#shop-search-sheet-input', Q_MULTI, delay=30)
    page.wait_for_timeout(1500)
    report['states']['loading'] = page.evaluate(JS)
    shoot(page, '390-loading')
    ctx.close()

    # ---------- 3) error (إجهاض الطلب — آمن، بلا تغيير بيانات) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1600)
    page.click('#shop-search-btn')
    page.wait_for_timeout(900)
    page.route('**/products?*search=*', lambda route: route.abort())
    page.type('#shop-search-sheet-input', Q_MULTI, delay=30)
    page.wait_for_timeout(2000)
    report['states']['error'] = page.evaluate(JS)
    shoot(page, '390-error')
    ctx.close()

    # ---------- 4) dark ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1700)
    page.click('#shop-search-btn')
    page.wait_for_timeout(1200)
    page.type('#shop-search-sheet-input', Q_MULTI, delay=40)
    page.wait_for_timeout(1500)
    report['states']['dark_results'] = page.evaluate(JS)
    shoot(page, '390-dark-results')
    report['states']['dark_initial'] = page.evaluate(JS)
    ctx.close()

    # ---------- 5) focus (كيبورد) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1600)
    page.click('#shop-search-btn')
    page.wait_for_timeout(1200)
    page.type('#shop-search-sheet-input', Q_MULTI, delay=30)
    page.wait_for_timeout(1400)
    foc = None
    for _ in range(8):
        page.keyboard.press('Tab')
        page.wait_for_timeout(80)
        foc = page.evaluate("""(() => { const a = document.activeElement;
          return {cls: String(a.className), id: a.id, outline: getComputedStyle(a).outlineStyle + ' ' + getComputedStyle(a).outlineWidth,
                  shadow: getComputedStyle(a).boxShadow, border: getComputedStyle(a).borderTopColor}; })()""")
        if 'shop-search-row' in foc['cls'] or 'shop-search-chip' in foc['cls']:
            break
    report['functional']['focus_visible'] = foc
    shoot(page, '390-focus')
    ctx.close()

    # ---------- 6) responsive ----------
    for w, h in [(360, 780), (430, 900), (600, 900), (768, 1000)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, locale='ar', device_scale_factor=2 if w < 768 else 1)
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1600)
        page.click('#shop-search-btn')
        page.wait_for_timeout(1100)
        page.type('#shop-search-sheet-input', Q_MULTI, delay=30)
        page.wait_for_timeout(1500)
        key = 'results_%dx%d' % (w, h)
        report['states'][key] = page.evaluate(JS)
        shoot(page, '%dx%d-results' % (w, h))
        ctx.close()

    # ---------- 7) desktop regression (1024 / 1366) ----------
    for w, h in [(1024, 800), (1366, 900)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1600)
        report['states']['desktop_%d' % w] = page.evaluate("""(() => { const s = document.getElementById('shop-search-sheet');
          const btn = document.getElementById('shop-search-btn');
          const form = document.getElementById('shop-search-form');
          return {sheetHidden: s.hidden, sheetTop: Math.round(s.getBoundingClientRect().top),
                  searchBtnDisplay: getComputedStyle(btn).display,
                  formDisplay: form ? getComputedStyle(form).display : null,
                  headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
                  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()""")
        if w == 1366:
            shoot(page, '1366-desktop')
        ctx.close()

    # ---------- 8) menu/cart/home regression ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1600)
    r = {}
    page.click('#shop-burger')
    page.wait_for_timeout(700)
    r['menu_open'] = page.evaluate("""(() => { const d = document.getElementById('shop-drawer');
      const h = document.querySelector('.shop-header');
      return {open: d.classList.contains('is-open'), drawerTop: Math.round(d.getBoundingClientRect().top),
              headerBottom: Math.round(h.getBoundingClientRect().bottom),
              rowH: Math.round(document.querySelector('.shop-drawer__link').getBoundingClientRect().height)}; })()""")
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    r['menu_closed'] = page.evaluate("document.getElementById('shop-drawer').hidden")
    r['cart'] = page.evaluate("""(() => { const c = document.getElementById('shop-cart-button');
      return c ? {href: c.getAttribute('href'), w: Math.round(c.getBoundingClientRect().width)} : null; })()""")
    r['home'] = page.evaluate("""(() => ({cards: document.querySelectorAll('.shop-card').length,
      hero: !!document.querySelector('.shop-home-slider, .shop-hero'),
      ticker: !!document.querySelector('.shop-ticker')}))()""")
    r['header'] = page.evaluate("""(() => ({h: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
      brand: Math.round(document.querySelector('.shop-brand__logo').getBoundingClientRect().width)}))()""")
    # resize ≥1024 أثناء فتح البحث
    page.click('#shop-search-btn')
    page.wait_for_timeout(700)
    page.set_viewport_size({'width': 1200, 'height': 844})
    page.wait_for_timeout(700)
    r['search_resize_1024'] = page.evaluate("""(() => ({hidden: document.getElementById('shop-search-sheet').hidden,
      open: document.getElementById('shop-search-sheet').classList.contains('is-open'),
      bodyLock: getComputedStyle(document.body).overflowY}))()""")
    report['functional']['regression'] = r
    ctx.close()
    b.close()

path = os.path.join(OUT, 'search-%s.json' % TAG)
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(report, fh, ensure_ascii=False, indent=2)
print('report:', path)
print('console errors:', len(report['console_errors']))
for e in report['console_errors'][:6]:
    print('  !', e)
print('shots:', len(report['shots']))
