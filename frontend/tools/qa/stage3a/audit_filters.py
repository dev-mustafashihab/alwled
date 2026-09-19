"""PHASE 3 · STEP 3A — Audit (قراءة فقط): الفلاتر · الترتيب · الرحلات الوظيفية · العدّاد.

الاستخدام: python3 audit_filters.py
لا يعدّل أي ملف تطبيق · لا يكتب بيانات (تغييرات hash فقط).
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3a'
os.makedirs(OUT, exist_ok=True)

R = {'console': [], 'shots': [], 'journey': {}}

FILTERS = """(() => {
  const px = v => Math.round(v * 100) / 100;
  const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {x: px(b.x), y: px(b.y), w: px(b.width), h: px(b.height), top: px(b.top), bottom: px(b.bottom)}; };
  const C = (el, ps) => { if (!el) return null; const c = getComputedStyle(el); const o = {};
    ps.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const txt = el => el ? (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 70) : null;
  const wrap = q('.shop-filters');
  const sheet = q('.shop-filters__sheet');
  const scrim = q('.shop-filters__scrim');
  const toolbar = q('.shop-toolbar');
  const toggle = q('.shop-filters__toggle');
  const controls = qa('.shop-toolbar input, .shop-toolbar select');
  return {
    viewport: {w: window.innerWidth, h: window.innerHeight},
    hash: location.hash,
    open: wrap ? wrap.classList.contains('is-open') : null,
    wrapCss: C(wrap, ['display', 'position', 'z-index']),
    sheet: sheet ? {rect: R(sheet), css: C(sheet, ['display', 'position', 'bottom', 'max-height', 'overflow-y',
      'background-color', 'border-top-left-radius', 'box-shadow', 'padding', 'transform', 'z-index']),
      clientH: px(sheet.clientHeight), scrollH: px(sheet.scrollHeight),
      maxScroll: px(sheet.scrollHeight - sheet.clientHeight)} : null,
    scrim: scrim ? {rect: R(scrim), css: C(scrim, ['display', 'position', 'background-color', 'opacity', 'pointer-events', 'z-index'])} : null,
    sheetHead: (() => { const h = q('.shop-filters__sheet-head'); return h ? {rect: R(h), css: C(h, ['padding', 'position', 'background-color', 'border-bottom-width']),
      close: (() => { const c = q('.shop-filters__sheet-close'); return c ? {text: txt(c), rect: R(c), css: C(c, ['width', 'height', 'background-color', 'border-top-color']), aria: c.getAttribute('aria-label')} : null; })()} : null; })(),
    sheetFoot: (() => { const f = q('.shop-filters__sheet-foot'); return f ? {rect: R(f), css: C(f, ['padding', 'position', 'display', 'gap', 'background-color']),
      btns: qa('.shop-filters__sheet-foot .btn').map(b => ({text: txt(b), rect: R(b), css: C(b, ['min-height', 'height', 'flex', 'background-color', 'color', 'border-radius', 'font-size'])}))} : null; })(),
    toolbar: toolbar ? {rect: R(toolbar), css: C(toolbar, ['display', 'flex-direction', 'grid-template-columns', 'gap', 'padding', 'background-color', 'border-top-width', 'box-shadow'])} : null,
    toggle: toggle ? {text: txt(toggle), rect: R(toggle), expanded: toggle.getAttribute('aria-expanded'),
      aria: {controls: toggle.getAttribute('aria-controls')}, css: C(toggle, ['min-height', 'height', 'display', 'justify-content', 'padding', 'font-size', 'background-color', 'border-radius', 'border-top-color', 'cursor'])} : null,
    controlCount: controls.length,
    controls: controls.map(c => ({id: c.id, tag: c.tagName, type: c.getAttribute('type'), label: txt(c.closest('.shop-toolbar__field') ? c.closest('.shop-toolbar__field').querySelector('.shop-toolbar__label') : null),
      rect: R(c), css: C(c, ['height', 'min-height', 'font-size', 'background-color', 'border-top-color', 'border-radius', 'padding-inline-start', 'text-align']),
      aria: c.getAttribute('aria-label'), value: c.value, checked: c.checked, disabled: c.disabled, role: c.getAttribute('role')})),
    labels: qa('.shop-toolbar__label').map(l => ({text: txt(l), tag: l.tagName, forAttr: l.getAttribute('for'),
      rect: R(l), css: C(l, ['font-size', 'font-weight', 'color', 'display']),
      isRealLabel: l.tagName === 'LABEL'})),
    checks: qa('.shop-check').map(l => ({text: txt(l), rect: R(l), css: C(l, ['min-height', 'padding', 'border-top-color', 'border-radius', 'background-color', 'font-size']),
      input: (() => { const i = l.querySelector('input'); return i ? {type: i.getAttribute('type'), rect: R(i), checked: i.checked, id: i.id,
        aria: i.getAttribute('aria-label')} : null; })()})),
    count: (() => { const c = q('.shop-toolbar__count'); return c ? {text: txt(c), rect: R(c), css: C(c, ['font-size', 'font-weight', 'color'])} : null; })(),
    priceRange: (() => { const p = q('.shop-price-range'); return p ? {rect: R(p), css: C(p, ['display', 'gap']),
      inputs: qa('.shop-price-range .input').map(i => ({placeholder: i.getAttribute('placeholder'), rect: R(i), css: C(i, ['height', 'text-align', 'font-size']), aria: i.getAttribute('aria-label')}))} : null; })(),
    bodyLock: {body: getComputedStyle(document.body).overflowY, html: getComputedStyle(document.documentElement).overflowY,
               scrollY: Math.round(window.scrollY)},
    activeElement: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null,
    clearBtn: (() => { const b = qa('#shop-view .btn').filter(x => (x.textContent || '').indexOf('تفريغ') >= 0)[0];
      return b ? {text: txt(b), rect: R(b), css: C(b, ['min-height', 'height', 'font-size', 'background-color', 'border-radius'])} : null; })(),
    cardsCount: qa('.shop-card').length,
    firstCardName: txt(q('.shop-card__name'))
  };
})()"""


def shoot(page, name):
    p = os.path.join(OUT, name + '.png')
    page.screenshot(path=p)
    R['shots'].append(p)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- A) فلاتر الجوال: 390×844 و 390×600 ----------
    for w, h in [(390, 844), (390, 600)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, locale='ar', device_scale_factor=2)
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'type': m.type, 'text': m.text[:160]}) if m.type == 'error' else None)
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1700)
        key = 'm%d_%d' % (w, h)
        R[key + '_closed'] = page.evaluate(FILTERS)
        page.click('#shop-filters-toggle')
        page.wait_for_timeout(700)
        R[key + '_open'] = page.evaluate(FILTERS)
        shoot(page, 'filters-mobile-%dx%d-open' % (w, h))
        # تمرير داخل اللوحة
        page.evaluate("""(() => { const s = document.querySelector('.shop-filters__sheet'); if (s) s.scrollTop = s.scrollHeight; })()""")
        page.wait_for_timeout(400)
        R[key + '_scrolled'] = page.evaluate(FILTERS)
        # Escape: هل يُغلق؟
        page.keyboard.press('Escape')
        page.wait_for_timeout(600)
        R[key + '_after_escape'] = page.evaluate(FILTERS)
        # إغلاق بزر «عرض النتائج» + قياس إعادة التركيز
        page.click('.shop-filters__done')
        page.wait_for_timeout(600)
        R[key + '_after_done'] = page.evaluate(FILTERS)
        # إغلاق بالـscrim
        page.click('#shop-filters-toggle')
        page.wait_for_timeout(500)
        page.click('.shop-filters__scrim', force=True)
        page.wait_for_timeout(500)
        R[key + '_after_scrim'] = page.evaluate(FILTERS)
        print('mobile filters %dx%d: sheet=%s open=%s esc=%s done=%s scrim=%s controls=%s' % (
            w, h, R[key + '_open']['sheet'] and R[key + '_open']['sheet']['rect']['h'],
            R[key + '_open']['open'], R[key + '_after_escape']['open'],
            R[key + '_after_done']['open'], R[key + '_after_scrim']['open'], R[key + '_open']['controlCount']))
        ctx.close()

    # ---------- B) فلاتر الديسكتوب ----------
    for w in (1024, 1366, 1440):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1700)
        R['d%d' % w] = page.evaluate(FILTERS)
        if w in (1024, 1366):
            shoot(page, 'filters-desktop-%d' % w)
        d = R['d%d' % w]
        print('desktop %d: toolbar=%s toggle=%s controls=%s' % (
            w, d['toolbar'] and (d['toolbar']['rect']['w'], d['toolbar']['rect']['h']),
            d['toggle'] and d['toggle']['rect']['h'], d['controlCount']))
        ctx.close()

    # ---------- C) الرحلة الوظيفية ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'type': m.type, 'text': m.text[:160]}) if m.type == 'error' else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1700)

    def snap(label):
        d = page.evaluate("""(() => ({hash: location.hash, count: (document.querySelector('.shop-toolbar__count')||{}).textContent,
          cards: document.querySelectorAll('.shop-card').length,
          first: (document.querySelector('.shop-card__name')||{}).textContent,
          cat: (document.getElementById('shop-filter-category')||{}).value, brand: (document.getElementById('shop-filter-brand')||{}).value,
          sort: (document.getElementById('shop-filter-sort')||{}).value, search: (document.getElementById('shop-filter-search')||{}).value,
          min: (document.getElementById('shop-filter-minprice')||{}).value, max: (document.getElementById('shop-filter-maxprice')||{}).value,
          instock: (document.getElementById('shop-filter-instock')||{}).checked, offers: (document.getElementById('shop-filter-offers')||{}).checked,
          clearBtn: !!Array.from(document.querySelectorAll('#shop-view .btn')).find(b => (b.textContent||'').indexOf('تفريغ') >= 0),
          empty: !!document.querySelector('.state--empty'), stateTitle: (document.querySelector('.state__title')||{}).textContent}))()""")
        R['journey'][label] = d
        print('journey %-18s %s' % (label, {k: d[k] for k in ('hash', 'count', 'cards', 'first', 'clearBtn', 'empty')}))
        return d

    snap('start')
    page.select_option('#shop-filter-category', '293')
    page.wait_for_timeout(1700)
    snap('category_293')
    page.select_option('#shop-filter-brand', '254')
    page.wait_for_timeout(1700)
    snap('plus_brand_254')
    page.select_option('#shop-filter-sort', 'price:asc')
    page.wait_for_timeout(1700)
    snap('sort_price_asc')
    page.select_option('#shop-filter-sort', 'price:desc')
    page.wait_for_timeout(1700)
    snap('sort_price_desc')
    page.fill('#shop-filter-minprice', '400')
    page.dispatch_event('#shop-filter-minprice', 'change')
    page.wait_for_timeout(1700)
    snap('minprice_400')
    page.check('#shop-filter-instock')
    page.wait_for_timeout(1700)
    snap('instock')
    page.check('#shop-filter-offers')
    page.wait_for_timeout(1700)
    snap('offers')
    # إزالة فلتر واحد
    page.select_option('#shop-filter-brand', '')
    page.wait_for_timeout(1700)
    snap('remove_brand')
    # إعادة تحميل: هل الحالة تستمر؟
    page.reload(wait_until='load')
    page.wait_for_timeout(2200)
    snap('after_reload')
    # back / forward
    page.go_back()
    page.wait_for_timeout(1700)
    snap('after_back')
    page.go_forward()
    page.wait_for_timeout(1700)
    snap('after_forward')
    # تفريغ كل الفلاتر
    page.evaluate("""(() => { const b = Array.from(document.querySelectorAll('#shop-view .btn')).find(x => (x.textContent||'').indexOf('تفريغ') >= 0); if (b) b.click(); })()""")
    page.wait_for_timeout(1800)
    snap('reset_all')
    shoot(page, 'journey-end-1366')
    ctx.close()

    # ---------- D) الترتيب: تحقّق ترتيب النتائج ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    for label, value in [('default', None), ('price_asc', 'price:asc'), ('price_desc', 'price:desc'), ('name_asc', 'name:asc')]:
        page.evaluate('location.hash = "#/products%s"' % ('' if not value else '?sortBy=%s&sortOrder=%s' % tuple(value.split(':'))))
        page.wait_for_timeout(1700)
        R['sort_%s' % label] = page.evaluate("""(() => Array.from(document.querySelectorAll('.shop-card')).map(c => ({
          name: (c.querySelector('.shop-card__name')||{}).textContent, price: (c.querySelector('.shop-price__now')||{}).textContent})))()""")
        print('sort %s: %s' % (label, [x['name'] for x in R['sort_%s' % label]]))
    ctx.close()
    b.close()

with open(os.path.join(OUT, 'audit-filters.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nreport:', os.path.join(OUT, 'audit-filters.json'))
print('console:', len(R['console']), '| shots:', len(R['shots']))
