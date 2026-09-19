"""PHASE 3 · STEP 3A — Audit (قراءة فقط): تباين · تركيز/كيبورد · أهداف لمس · تدرّج عناوين · أداء/شبكة.

الاستخدام: python3 audit_a11y.py
لا يعدّل أي ملف تطبيق.
"""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3a'
os.makedirs(OUT, exist_ok=True)
R = {'console': [], 'failed': [], 'net': {}, 'shots': []}

JS = r"""(() => {
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
  const q = s => document.querySelector(s);
  const check = (sel, label) => { const el = typeof sel === 'string' ? q(sel) : sel; if (!el) return null;
    const cs = getComputedStyle(el); const fg0 = parse(cs.color); const bg = effBg(el);
    const fg = fg0.a < 1 ? {r: fg0.r * fg0.a + bg.r * (1 - fg0.a), g: fg0.g * fg0.a + bg.g * (1 - fg0.a), b: fg0.b * fg0.a + bg.b * (1 - fg0.a)} : fg0;
    return {label: label, text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34), color: cs.color,
      bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')', ratio: ratio(fg, bg),
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, cls: el.className}; };
  const SEL = {
    light: [['.shop-section__title','h1 الصفحة'],['.shop-section__sub','وصف الصفحة'],['.shop-crumbs a','رابط مسار'],
      ['.shop-crumbs span','فاصل المسار'],['.shop-toolbar__label','تسمية فلتر'],['.shop-toolbar__count','عدّاد النتائج'],
      ['#shop-filter-search','حقل البحث'],['#shop-filter-category','select التصنيف'],['.shop-check span','نص خيار الاختيار'],
      ['.shop-price-range__sep','فاصل نطاق السعر'],['.shop-card__name a','اسم المنتج'],['.shop-card__meta span','ميتا البطاقة'],
      ['.shop-price__now','السعر'],['.shop-card .badge','شارة (خصم/توفّر)'],['.shop-card__add','زر أضف للسلة'],
      ['.shop-card__details','زر التفاصيل'],['.shop-taxonomy__name','اسم تصنيف'],['.shop-taxonomy__count','عدّاد تصنيف'],
      ['.shop-taxonomy__item .shop-note','وصف تصنيف'],['.shop-section__link','رابط عرض الكل']],
    state: [['.state__title','عنوان الحالة'],['.state__text','نص الحالة'],['.state__icon','أيقونة الحالة'],['.state .btn','زر الحالة']],
    sheet: [['.shop-filters__sheet-head strong','عنوان اللوحة'],['.shop-filters__sheet .shop-toolbar__label','تسمية داخل اللوحة'],
      ['.shop-filters__done','زر عرض النتائج'],['.shop-filters__clear','زر تفريغ'],['.shop-filters__sheet-close','زر إغلاق اللوحة']]
  };
  const out = {};
  ['light', 'state', 'sheet'].forEach(k => { out[k] = SEL[k].map(x => check(x[0], x[1])).filter(Boolean); });
  // أهداف اللمس
  const small = [];
  Array.from(document.querySelectorAll('#shop-view a, #shop-view button, #shop-view input, #shop-view select, #shop-view label')).forEach(el => {
    const b = el.getBoundingClientRect(); if (!b.width || !b.height) return;
    if (b.width < 44 || b.height < 44) small.push({tag: el.tagName, cls: el.className, text: (el.textContent || '').trim().slice(0, 28),
      w: Math.round(b.width), h: Math.round(b.height), id: el.id, type: el.getAttribute('type')}); });
  out.smallTargets = small;
  // تدرّج العناوين
  out.headings = Array.from(document.querySelectorAll('#shop-view h1, #shop-view h2, #shop-view h3, #shop-view h4'))
    .map(h => ({tag: h.tagName, text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 46), cls: h.className}));
  // aria-live / aria-busy / roles
  out.live = Array.from(document.querySelectorAll('[aria-live]')).map(e => ({cls: e.className, live: e.getAttribute('aria-live'), text: (e.textContent || '').trim().slice(0, 40)}));
  out.busy = Array.from(document.querySelectorAll('[aria-busy]')).map(e => ({cls: e.className, busy: e.getAttribute('aria-busy')}));
  out.roleSearch = !!q('[role=search]');
  out.ariaCurrent = Array.from(document.querySelectorAll('[aria-current]')).map(e => ({cls: e.className, v: e.getAttribute('aria-current')}));
  // الصور
  out.images = Array.from(document.querySelectorAll('#shop-view img')).map(i => ({src: (i.getAttribute('src') || '').slice(0, 60),
    loading: i.getAttribute('loading'), decoding: i.getAttribute('decoding'), alt: i.getAttribute('alt'),
    objectFit: getComputedStyle(i).objectFit, natural: [i.naturalWidth, i.naturalHeight], rect: (() => { const b = i.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })()}));
  out.placeholders = Array.from(document.querySelectorAll('.shop-card__placeholder')).length;
  out.domNodes = document.querySelectorAll('*').length;
  out.pageBg = getComputedStyle(document.body).backgroundColor;
  out.theme = document.documentElement.getAttribute('data-theme');
  return out;
})()"""


def shoot(page, name):
    p = os.path.join(OUT, name + '.png')
    page.screenshot(path=p)
    R['shots'].append(p)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- A) تباين + أهداف + أداء: light 390 / 1366 + dark 1366 ----------
    for label, w, theme in [('light390', 390, 'light'), ('light1366', 1366, 'light'), ('dark1366', 1366, 'dark'), ('dark390', 390, 'dark')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.on('console', lambda m: R['console'].append({'type': m.type, 'text': m.text[:200]}) if m.type in ('error', 'warning') else None)
        page.on('requestfailed', lambda r: R['failed'].append({'url': r.url[:110], 'reason': str(r.failure)[:60]}))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1700)
        R['products_' + label] = page.evaluate(JS)
        d = R['products_' + label]
        print('%s: small targets=%d | live=%d | nodes=%d | theme=%s' % (label, len(d['smallTargets']), len(d['live']), d['domNodes'], d['theme']))
        for c in d['light']:
            print('   %-22s %s %s  ratio=%s' % (c['label'], c['fontSize'], c['color'], c['ratio']))
        # كيبورد: ترتيب Tab + حلقة التركيز
        page.evaluate('window.scrollTo(0, 0)')
        page.click('body', position={'x': 5, 'y': 300})
        stops = []
        for _ in range(26):
            page.keyboard.press('Tab')
            page.wait_for_timeout(90)
            stops.append(page.evaluate("""(() => { const a = document.activeElement; if (!a) return null; const cs = getComputedStyle(a);
              const b = a.getBoundingClientRect();
              return {tag: a.tagName, cls: a.className, id: a.id, text: (a.textContent||'').trim().slice(0, 26),
                outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, shadow: cs.boxShadow.slice(0, 60),
                rect: [Math.round(b.width), Math.round(b.height)]}; })()"""))
        R['tab_' + label] = stops
        print('   tab stops:', len(stops), '| أول 6:', [(s['tag'], s['cls'][:24] or s['id']) for s in stops[:6]])
        ctx.close()

    # ---------- B) حالة الفارغ/الخطأ: تباين ----------
    for label, hash_, mode in [('empty', '#/products?search=zzzznothing', None), ('error', '#/products', 'abort')]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        if mode == 'abort':
            page.route('**/products?*', lambda r: r.abort())
        page.evaluate('location.hash = "%s"' % hash_)
        page.wait_for_timeout(2000)
        R['state_' + label] = page.evaluate(JS)
        print('state %s: %s' % (label, [(c['label'], c['ratio']) for c in R['state_' + label]['state']]))
        ctx.close()

    # ---------- C) لوحة الفلاتر (390 مفتوحة): تباين + أهداف + كيبورد ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1700)
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(700)
    R['sheet_390'] = page.evaluate(JS)
    print('sheet: small=%d' % len(R['sheet_390']['smallTargets']))
    for c in R['sheet_390']['sheet']:
        print('   %-24s %s ratio=%s' % (c['label'], c['color'], c['ratio']))
    stops = []
    for _ in range(14):
        page.keyboard.press('Tab')
        page.wait_for_timeout(90)
        stops.append(page.evaluate("""(() => { const a = document.activeElement; if (!a) return null;
          return {tag: a.tagName, id: a.id, cls: a.className, inSheet: !!a.closest('.shop-filters__sheet'),
            outline: getComputedStyle(a).outlineWidth + ' ' + getComputedStyle(a).outlineColor}; })()"""))
    R['tab_sheet'] = stops
    print('   tab in sheet:', [(s['tag'], s['id'] or s['cls'][:20], s['inSheet']) for s in stops[:10]])
    ctx.close()

    # ---------- D) القاعدة الميتة: hover على البطاقة (var غير معرّف) ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1700)
    R['hover'] = page.evaluate("""(() => { const d = document.querySelector('.shop-card__details'); const cs = getComputedStyle(d);
      const c = document.querySelector('.shop-card'); const cs2 = getComputedStyle(c);
      return {details: {color: cs.color, borderColor: cs.borderTopColor, bg: cs.backgroundColor},
              card: {shadow: cs2.boxShadow.slice(0, 70), transform: cs2.transform}}; })()""")
    page.hover('.shop-card__details')
    page.wait_for_timeout(500)
    R['hover']['detailsHover'] = page.evaluate("""(() => { const d = document.querySelector('.shop-card__details'); const cs = getComputedStyle(d);
      return {color: cs.color, borderColor: cs.borderTopColor, bg: cs.backgroundColor}; })()""")
    page.hover('.shop-card__name a')
    page.wait_for_timeout(500)
    R['hover']['nameHover'] = page.evaluate("""(() => { const n = document.querySelector('.shop-card__name a'); return {color: getComputedStyle(n).color}; })()""")
    page.evaluate('window.scrollTo(0, 260)')
    page.wait_for_timeout(300)
    box = page.evaluate("""(() => { const m = document.querySelector('.shop-card__media').getBoundingClientRect();
      return {x: m.x + m.width / 2, y: m.y + m.height / 2}; })()""")
    page.mouse.move(box['x'], box['y'])
    page.wait_for_timeout(400)
    R['hover']['cardHover'] = page.evaluate("""(() => { const c = document.querySelector('.shop-card'); const cs = getComputedStyle(c);
      return {shadow: cs.boxShadow.slice(0, 70), transform: cs.transform, mediaBg: getComputedStyle(c.querySelector('.shop-card__media')).backgroundColor}; })()""")
    R['hover']['mediaHitTest'] = page.evaluate("""(() => { const m = document.querySelector('.shop-card__media').getBoundingClientRect();
      const el = document.elementFromPoint(m.x + m.width / 2, m.y + m.height / 2);
      return {topElement: el.className || el.tagName, isInsideMediaLink: !!(el.closest && el.closest('.shop-card__media'))}; })()""")
    print('hover:', json.dumps(R['hover'], ensure_ascii=False)[:400])
    ctx.close()

    # ---------- D2) عناصر حسّاسة في الثيم الداكن (اللوحة/الشارة/الزر) ----------
    for label, w, theme in [('dark390', 390, 'dark'), ('dark1366', 1366, 'dark')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1800)
        if w == 390:
            page.click('#shop-filters-toggle')
            page.wait_for_timeout(600)
        R['darkdetail_' + label] = page.evaluate("""(() => { const C = (s, ps) => { const el = document.querySelector(s); if (!el) return null;
            const cs = getComputedStyle(el); const o = {}; ps.forEach(p => o[p] = cs.getPropertyValue(p)); return o; };
          return {sheet: C('.shop-filters__sheet', ['background-color', 'border-top-left-radius', 'box-shadow']),
                  check: C('.shop-check', ['background-color', 'color', 'border-top-color']),
                  checkSpan: C('.shop-check span', ['color']),
                  badgeDanger: C('.badge--danger', ['background-color', 'color', 'border-top-color']),
                  badgeSuccess: C('.badge--success', ['background-color', 'color']),
                  btnPrimary: C('.shop-card__add', ['background-color', 'color']),
                  btnGhost: C('.shop-card__details', ['background-color', 'color', 'border-top-color']),
                  toolbarLabel: C('.shop-toolbar__label', ['color']),
                  cardBg: C('.shop-card', ['background-color', 'border-top-color']),
                  input: C('#shop-filter-search', ['background-color', 'color', 'border-top-color']),
                  select: C('#shop-filter-category', ['background-color', 'color', 'border-top-color']),
                  priceSep: C('.shop-price-range__sep', ['color']),
                  sheetHead: C('.shop-filters__sheet-head', ['background-color', 'border-bottom-color']),
                  sheetFoot: C('.shop-filters__sheet-foot', ['background-color', 'border-top-color']),
                  scrim: C('.shop-filters__scrim', ['background-color']),
                  placeholder: C('.shop-card__placeholder', ['background-image', 'color']),
                  count: C('.shop-toolbar__count', ['color'])}; })()""")
        print('darkdetail %s: check=%s badge=%s add=%s sheet=%s' % (label, R['darkdetail_' + label]['check'],
              R['darkdetail_' + label]['badgeDanger'], R['darkdetail_' + label]['btnPrimary'], R['darkdetail_' + label]['sheet']))
        ctx.close()

    # ---------- E) الشبكة: عدد الطلبات لكل خطوة ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1].split('?')[0] + ('?' + r.url.split('?')[1][:40] if '?' in r.url else '')) if '/api/v1/' in r.url else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(2200)
    R['net']['home'] = list(reqs); reqs.clear()
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(2000)
    R['net']['products_1'] = list(reqs); reqs.clear()
    page.evaluate('location.hash = "#/products?categoryId=293"')
    page.wait_for_timeout(2000)
    R['net']['products_filter'] = list(reqs); reqs.clear()
    page.evaluate('location.hash = "#/products?view=categories"')
    page.wait_for_timeout(2000)
    R['net']['categories'] = list(reqs); reqs.clear()
    page.evaluate('location.hash = "#/products?view=brands"')
    page.wait_for_timeout(2000)
    R['net']['brands'] = list(reqs); reqs.clear()
    print('net:', json.dumps(R['net'], ensure_ascii=False))
    ctx.close()
    b.close()

with open(os.path.join(OUT, 'audit-a11y.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nreport:', os.path.join(OUT, 'audit-a11y.json'), '| console:', len(R['console']), '| failed:', len(R['failed']))
