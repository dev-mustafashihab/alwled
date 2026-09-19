"""PHASE 4 · STEP 4B.1 — التحقق: CTA/التوفّر/المعرض/المصغّرة/نص الدفع + انحدارات."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage4b'
os.makedirs(OUT, exist_ok=True)
R = {'console': [], 'failed': [], 'matrix': {}, 'theme': {}, 'products': {}, 'gallery': {}, 'a11y': {}, 'regression': {}, 'misc': {}}
WIDTHS = [360, 390, 430, 600, 768, 769, 900, 1023, 1024, 1280, 1366, 1440, 1920]
IMG = 'data:image/svg+xml;utf8,' + (
    "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='450'><rect width='600' height='450' fill='%23e2e8f0'/>"
    "<text x='300' y='230' font-size='40' text-anchor='middle' fill='%23475569'>T {n}</text></svg>")
IMGS = [IMG.replace('{n}', str(i)) for i in (1, 2, 3)]

CONTRAST = r"""(() => {
  const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const effBg = el => { let cur = el, st = []; while (cur) { const c = parse(getComputedStyle(cur).backgroundColor);
      if (c && c.a > 0) st.push(c); if (c && c.a >= 1) break; cur = cur.parentElement; }
    let base = { r: 255, g: 255, b: 255 }; for (let i = st.length - 1; i >= 0; i--) { const s = st[i];
      base = { r: s.r * s.a + base.r * (1 - s.a), g: s.g * s.a + base.g * (1 - s.a), b: s.b * s.a + base.b * (1 - s.a) }; } return base; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg), hi = Math.max(a, b), lo = Math.min(a, b);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };
  const el = document.querySelector('#shop-add-to-cart');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const bg = effBg(el);
  const fg = parse(cs.color);
  const opacity = parseFloat(cs.opacity);
  const fgBlend = opacity < 1 ? { r: fg.r * opacity + bg.r * (1 - opacity), g: fg.g * opacity + bg.g * (1 - opacity), b: fg.b * opacity + bg.b * (1 - opacity) } : fg;
  return { text: el.textContent.trim(), disabled: el.disabled, bg: cs.backgroundColor, color: cs.color, opacity: cs.opacity,
    border: cs.borderColor, cursor: cs.cursor, box: (() => { const b = el.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); })(),
    contrast: ratio(fgBlend, bg), bgResolved: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')' };
})()"""

PDP = r"""(() => {
  const q = s => document.querySelector(s);
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) }; };
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const prod = q('.shop-product');
  const cols = prod ? getComputedStyle(prod).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  const add = q('#shop-add-to-cart');
  const gal = q('.shop-gallery');
  return {
    vw: window.innerWidth, cols: cols,
    gallery: box(gal), stage: box(q('.shop-gallery__stage')), stageAspect: cs(q('.shop-gallery__stage'), 'aspectRatio'),
    stageMaxW: cs(gal, 'maxWidth'), stageMargin: cs(gal, 'marginInline') || cs(gal, 'marginLeft'),
    thumb: box(q('.shop-gallery__thumb')),
    thumbActive: (() => { const t = q('.shop-gallery__thumb[aria-pressed="true"]'); if (!t) return null;
      return { border: cs(t, 'borderColor'), shadow: cs(t, 'boxShadow').slice(0, 44), pressed: t.getAttribute('aria-pressed') }; })(),
    add: add ? { text: add.textContent.trim(), disabled: add.disabled, box: box(add), bg: cs(add, 'backgroundColor'), color: cs(add, 'color') } : null,
    qty: box(q('.shop-qty')), qtyBtn: box(q('.shop-qty__btn')),
    note: !!q('.shop-buy .shop-note'), noteCount: document.querySelectorAll('.shop-buy .shop-note').length,
    buyChildren: Array.from(q('.shop-buy').children).map(c => String(c.className).slice(0, 22)),
    facts: Array.from(document.querySelectorAll('.shop-fact')).map(f => (f.querySelector('.shop-fact__value') || {}).textContent),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docH: Math.round(document.documentElement.scrollHeight),
    body: cs(document.body, 'backgroundColor')
  };
})()"""


def go(page, h, wait=2400):
    page.evaluate('location.hash = "%s"' % h)
    page.wait_for_timeout(wait)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ===== A) مصفوفة 13 عرضًا (فاتح) على 632 =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'matrix'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:150]}))
    page.on('requestfailed', lambda r: R['failed'].append({'u': r.url[-60:]}))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    for w in WIDTHS:
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(400)
        go(page, '#/products/632')
        m = page.evaluate(PDP)
        R['matrix'][str(w)] = m
        print('%-5d cols=%s gallery=%sx%s stage=%sx%s cap=%s add=%sx%s qty=%s ov=%s docH=%s note=%s' % (
            w, m['cols'], m['gallery'] and m['gallery']['w'], m['gallery'] and m['gallery']['h'],
            m['stage'] and m['stage']['w'], m['stage'] and m['stage']['h'], m['stageMaxW'],
            m['add'] and m['add']['box']['w'], m['add'] and m['add']['box']['h'], m['qty'] and m['qty']['h'], m['overflow'], m['docH'], m['note']))
        if w in (390, 768, 1024, 1366):
            page.screenshot(path=os.path.join(OUT, 'pdp-%d-light.png' % w))
    ctx.close()

    # ===== B) فاتح/داكن: 390 · 768 · 1024 · 1366 (632 متاح + 633 غير متاح) =====
    for w in (390, 768, 1024, 1366):
        for theme in ('light', 'dark'):
            for pid in (632, 633):
                ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
                if theme == 'dark':
                    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
                page = ctx.new_page()
                page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'theme'}) if m.type in ('error', 'warning') else None)
                page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
                go(page, '#/products/%d' % pid, 2600)
                key = '%d_%s_%d' % (w, theme, pid)
                R['theme'][key] = {'pdp': page.evaluate(PDP), 'cta': page.evaluate(CONTRAST)}
                t = R['theme'][key]
                print('%-4d %-5s %d: cta=%s dis=%s bg=%s contrast=%s thumb=%s' % (
                    w, theme, pid, t['cta']['text'], t['cta']['disabled'], t['cta']['bgResolved'], t['cta']['contrast'],
                    t['pdp']['thumbActive'] and t['pdp']['thumbActive']['border']))
                if w == 390 and theme == 'dark':
                    page.screenshot(path=os.path.join(OUT, 'pdp-390-dark-%d.png' % pid))
                ctx.close()

    # ===== C) المنتج غير المتوفر: سلوك كامل (disabled/auth/cart/لوحة المفاتيح) =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'unavail'}) if m.type in ('error', 'warning') else None)
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    go(page, '#/products/633', 2600)
    reqs.clear()
    before = page.evaluate("""(() => { const b=document.getElementById('shop-add-to-cart'); return { text:b.textContent.trim(), disabled:b.disabled,
      tabIndex:b.tabIndex, ariaDisabled:b.getAttribute('aria-disabled'), hasDisabledAttr:b.hasAttribute('disabled') }; })()""")
    # محاولة نقر برمجي + Enter من لوحة المفاتيح
    page.evaluate("document.getElementById('shop-add-to-cart').click()"); page.wait_for_timeout(700)
    page.evaluate("document.getElementById('shop-add-to-cart').focus()"); page.wait_for_timeout(200)
    focused = page.evaluate("document.activeElement.id || document.activeElement.tagName")
    page.keyboard.press('Enter'); page.wait_for_timeout(600)
    after = page.evaluate("""(() => ({ modal: !!document.querySelector('.shop-prompt, [role=dialog], .modal'), body: getComputedStyle(document.body).overflowY,
      focus: document.activeElement.id || document.activeElement.tagName }))()""")
    R['products']['unavailable'] = {'before': before, 'focus_attempt': focused, 'after': after, 'reqs': list(reqs)}
    print('\nunavailable(633):', json.dumps(R['products']['unavailable'], ensure_ascii=False))
    # ترتيب التركيز: هل الزر قابل للوصول؟
    page.evaluate('document.body.focus()')
    stops = []
    for _ in range(14):
        page.keyboard.press('Tab'); page.wait_for_timeout(70)
        stops.append(page.evaluate("(() => { const a=document.activeElement; return a ? (a.id || String(a.className).slice(0,20)) : null; })()"))
    R['products']['unavailable_tab'] = stops
    print('  tab stops:', stops)
    ctx.close()
    # المنتج المتاح: نقر ⇒ مصادقة ضيف + 0 طلبات
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs2 = []
    page.on('request', lambda r: reqs2.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    go(page, '#/products/632', 2600)
    st = page.evaluate("""(() => { const b=document.getElementById('shop-add-to-cart'); return { text:b.textContent.trim(), disabled:b.disabled, hasDisabledAttr:b.hasAttribute('disabled') }; })()""")
    reqs2.clear()
    page.click('#shop-add-to-cart'); page.wait_for_timeout(900)
    R['products']['available'] = {'before': st, 'modal': page.evaluate("!!document.querySelector('.shop-prompt, [role=dialog], .modal')"),
                                  'body': page.evaluate("getComputedStyle(document.body).overflowY"), 'reqs': list(reqs2)}
    print('available(632):', json.dumps(R['products']['available'], ensure_ascii=False))
    # لوحة المفاتيح: Enter على الزر المتاح
    page.keyboard.press('Escape'); page.wait_for_timeout(600)
    page.evaluate("document.getElementById('shop-add-to-cart').focus()"); page.wait_for_timeout(200)
    R['a11y']['cta_focus'] = page.evaluate("""(() => { const a=document.activeElement; const cs=getComputedStyle(a);
      return { id:a.id, outline: cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor, box: (()=>{const b=a.getBoundingClientRect();return Math.round(b.width)+'x'+Math.round(b.height);})() }; })()""")
    page.keyboard.press('Enter'); page.wait_for_timeout(800)
    R['a11y']['after_enter'] = page.evaluate("({modal: !!document.querySelector('.shop-prompt, [role=dialog], .modal'), body: getComputedStyle(document.body).overflowY})")
    print('cta focus:', R['a11y']['cta_focus'], '| after Enter:', R['a11y']['after_enter'])
    # إتاحة عامة
    R['a11y']['general'] = page.evaluate(r"""(() => {
      const qa = s => Array.from(document.querySelectorAll(s));
      const vis = el => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      const TAB = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
      const ids = qa('[id]').map(e => e.id);
      return { dupIds: ids.filter((v, i) => ids.indexOf(v) !== i),
        hiddenTabbable: qa(TAB).filter(el => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          return b.width === 0 && b.height === 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }).length,
        thumbFocusable: qa('.shop-gallery__thumb').filter(vis).length,
        ctaInTab: qa(TAB).filter(el => el.id === 'shop-add-to-cart').length,
        disabledNative: document.getElementById('shop-add-to-cart').disabled === false }; })()""")
    print('a11y general:', R['a11y']['general'])
    ctx.close()

    # ===== D) المعرض متعدد الصور (fixture وقت تشغيل) =====
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'gallery'}) if m.type in ('error', 'warning') else None)

    def handler(route):
        try:
            data = route.fetch().json()
            it = data.get('data', data)
            it.update({'images': [{'url': IMGS[0]}, {'url': IMGS[1]}, {'url': IMGS[2]}], 'primaryImage': {'url': IMGS[0]}})
            route.fulfill(status=200, content_type='application/json', body=json.dumps(data, ensure_ascii=False))
        except Exception:
            route.continue_()
    page.route('**/api/v1/products/*', handler)
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    go(page, '#/products/632', 2600)
    R['gallery']['multi'] = page.evaluate(r"""(() => {
      const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
      const thumbs = Array.from(document.querySelectorAll('.shop-gallery__thumb'));
      const stage = document.querySelector('.shop-gallery__stage img');
      return { thumbs: thumbs.length,
        stage: { fit: cs(stage, 'objectFit'), alt: stage && stage.getAttribute('alt'), box: (() => { const b = stage.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); })() },
        info: thumbs.map(t => ({ pressed: t.getAttribute('aria-pressed'), label: t.getAttribute('aria-label'), box: (() => { const b = t.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); })(),
          border: cs(t, 'borderColor'), shadow: cs(t, 'boxShadow').slice(0, 40) })),
        order: thumbs.map(t => Math.round(t.getBoundingClientRect().x)),
        galleryBox: (() => { const b = document.querySelector('.shop-gallery').getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); })(),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
    print('\ngallery multi:', json.dumps(R['gallery']['multi'], ensure_ascii=False)[:600])
    # تبديل + لوحة مفاتيح
    page.evaluate("document.querySelectorAll('.shop-gallery__thumb')[2].click()"); page.wait_for_timeout(500)
    R['gallery']['after_click'] = page.evaluate("Array.from(document.querySelectorAll('.shop-gallery__thumb')).map(t=>t.getAttribute('aria-pressed'))")
    page.evaluate("document.querySelectorAll('.shop-gallery__thumb')[0].focus()"); page.wait_for_timeout(200)
    R['gallery']['kb_focus'] = page.evaluate("""(() => { const a=document.activeElement; const cs=getComputedStyle(a);
      return { outline: cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor, border: cs.borderColor }; })()""")
    page.keyboard.press('Enter'); page.wait_for_timeout(500)
    R['gallery']['kb_after_enter'] = page.evaluate("Array.from(document.querySelectorAll('.shop-gallery__thumb')).map(t=>t.getAttribute('aria-pressed'))")
    print('  after click #3:', R['gallery']['after_click'], '| kb focus:', R['gallery']['kb_focus'], '| kb enter:', R['gallery']['kb_after_enter'])
    page.screenshot(path=os.path.join(OUT, 'pdp-gallery-multi-1366.png'))
    # 390 مع سقف المعرض
    page.set_viewport_size({'width': 390, 'height': 900}); page.wait_for_timeout(500)
    go(page, '#/products/632', 2400)
    R['gallery']['multi_390'] = page.evaluate(PDP)
    print('  multi@390:', R['gallery']['multi_390']['gallery'], R['gallery']['multi_390']['stage'], 'ov=', R['gallery']['multi_390']['overflow'])
    page.screenshot(path=os.path.join(OUT, 'pdp-gallery-multi-390.png'))
    ctx.close()

    # ===== E) انحدارات مقفلة =====
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1600)
        R['regression']['home_%d' % w] = page.evaluate("""(() => { const q=s=>document.querySelector(s);
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); };
          return { headerH: Math.round(q('.shop-header').getBoundingClientRect().height), homeCard: box(q('#shop-home-products .shop-card')||q('.shop-home .shop-card')),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2100)
        R['regression']['listing_%d' % w] = page.evaluate("""(() => { const c=document.querySelector('#shop-view > .shop-grid .shop-card');
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); };
          return { card: box(c), headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(2100)
        R['regression']['taxo_%d' % w] = page.evaluate("""(() => { const t=document.querySelector('#shop-view > .shop-taxonomy > .shop-taxonomy__item');
          const b=t.getBoundingClientRect(); return { taxo: Math.round(b.width)+'x'+Math.round(b.height), overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        if w == 390:
            page.evaluate('location.hash = "#/"'); page.wait_for_timeout(1800)
            page.click('#shop-search-btn'); page.wait_for_timeout(800)
            page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1600)
            R['regression']['search'] = page.evaluate("""(() => { const r=document.querySelector('.shop-search-row');
              return { rowH: r?Math.round(r.getBoundingClientRect().height):null, rows: document.querySelectorAll('.shop-search-row').length }; })()""")
            page.keyboard.press('Escape'); page.wait_for_timeout(500)
        ctx.close()

    b.close()

with open(os.path.join(OUT, 'verify4b1.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n== انحدارات ==', json.dumps(R['regression'], ensure_ascii=False))
print('console=%d failed=%d' % (len(R['console']), len(R['failed'])))
