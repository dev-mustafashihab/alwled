"""PHASE 2 · STEP 2D — قياس قائمة الجوال (قبل/بعد).

الاستخدام: python3 menu_probe.py before|after
يقيس: هندسة اللوحة/منطقة التمرير · كل عنصر تنقل · المظهر · CTA · التباعد ·
الحركة/التتابع (transition + inline delays) · الفائض · لقطات · انحدار الوظائف.
لا يكتب أي بيانات (تصفّح فقط).
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage2d'
os.makedirs(OUT, exist_ok=True)

report = {'tag': TAG, 'sizes': {}, 'functional': {}, 'console_errors': [], 'shots': []}

DUMP = """(() => {
  const px = v => Math.round(v * 100) / 100;
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {x: px(b.x), y: px(b.y), w: px(b.width), h: px(b.height), bottom: px(b.bottom)}; };
  const cs = (el, ps) => { if (!el) return null; const c = getComputedStyle(el); const o = {};
    ps.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
  const q = s => document.querySelector(s);
  const drawer = document.getElementById('shop-drawer');
  const panel = q('.shop-drawer__panel');
  const scroll = q('.shop-menu__scroll');
  const theme = q('.shop-menu__theme');
  const foot = q('.shop-drawer__foot');
  const links = Array.from(document.querySelectorAll('.shop-drawer__link, .shop-menu__link'));
  const labels = Array.from(document.querySelectorAll('.shop-menu__label'));
  const dividers = Array.from(document.querySelectorAll('.shop-menu__divider'));
  const viewH = window.innerHeight;
  const visible = links.filter(l => { const b = l.getBoundingClientRect();
    return b.top >= 0 && b.bottom <= viewH; }).length;
  const scrollBox = scroll ? scroll.getBoundingClientRect() : null;
  const inScrollView = links.filter(l => { const b = l.getBoundingClientRect();
    return scrollBox && b.top >= scrollBox.top - 1 && b.bottom <= scrollBox.bottom + 1; }).length;
  return {
    viewport: {w: window.innerWidth, h: viewH},
    drawer: r(drawer), drawerCss: cs(drawer, ['position', 'top', 'bottom', 'height', 'background', 'background-color',
      'z-index', 'opacity', 'transform', 'transition-duration', 'transition-property']),
    panel: r(panel), panelCss: cs(panel, ['height', 'overflow', 'padding', 'background', 'font-family', 'font-size', 'line-height']),
    scroll: r(scroll), scrollCss: cs(scroll, ['padding-inline-start', 'padding-inline-end', 'padding-block-start',
      'padding-block-end', 'overflow-y', 'scroll-behavior', 'height']),
    scrollContentH: scroll ? px(scroll.scrollHeight) : null,
    scrollClientH: scroll ? px(scroll.clientHeight) : null,
    links: links.map(l => ({text: (l.textContent || '').trim().slice(0, 24), cls: l.className,
      rect: r(l), css: cs(l, ['font-size', 'font-weight', 'line-height', 'padding-top', 'padding-bottom',
        'padding-inline-start', 'padding-inline-end', 'min-height', 'border-bottom-width', 'border-bottom-color',
        'border-radius', 'color', 'background-color', 'gap', 'opacity', 'transform',
        'transition-duration', 'transition-delay']),
      inlineDelay: l.style.transitionDelay, ariaCurrent: l.getAttribute('aria-current')})),
    labels: labels.map(l => ({text: (l.textContent || '').trim(), rect: r(l),
      css: cs(l, ['font-size', 'font-weight', 'color', 'padding', 'margin', 'letter-spacing', 'text-transform']),
      inlineDelay: l.style.transitionDelay})),
    dividers: dividers.map(d => ({rect: r(d), cls: d.className,
      css: cs(d, ['height', 'margin', 'background-color', 'border-top-width']), inlineDelay: d.style.transitionDelay})),
    theme: r(theme), themeCss: cs(theme, ['display', 'grid-template-columns', 'gap', 'padding', 'margin',
      'background-color', 'border-top-width', 'border-top-color', 'border-radius', 'transition-duration',
      'transition-delay', 'opacity', 'transform']),
    themeBtns: Array.from(document.querySelectorAll('.shop-menu__theme-btn')).map(b => ({text: (b.textContent || '').trim(),
      rect: r(b), pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'),
      css: cs(b, ['font-size', 'min-height', 'background-color', 'color', 'border-radius']),
      icon: r(b.querySelector('svg'))})),
    themeThumb: (() => { const t = q('.shop-menu__theme-thumb'); if (!t) return null;
      return {rect: r(t), css: cs(t, ['width', 'height', 'background-color', 'transform', 'border-radius'])}; })(),
    foot: r(foot), footCss: cs(foot, ['padding', 'margin', 'background-color', 'border-top-width', 'border-top-color',
      'transition-duration', 'transition-delay', 'opacity', 'transform']),
    footNote: (() => { const n = q('.shop-drawer__foot .shop-note'); return n ? {rect: r(n),
      css: cs(n, ['font-size', 'color', 'line-height'])} : null; })(),
    cta: (() => { const c = q('.shop-drawer__foot .btn'); if (!c) return null;
      return {text: (c.textContent || '').trim(), href: c.getAttribute('href'), rect: r(c),
        css: cs(c, ['min-height', 'height', 'background-color', 'color', 'border-color', 'border-radius',
          'font-size', 'padding-inline', 'box-shadow'])}; })(),
    userBlock: (() => { const u = q('.shop-menu__user'); return u ? {hidden: u.hidden, rect: r(u),
      css: cs(u, ['padding', 'background-color', 'border-bottom-width'])} : null; })(),
    guestBlock: (() => { const g = q('.shop-menu__guest'); return g ? {hidden: g.hidden, rect: r(g)} : null; })(),
    accountBlock: (() => { const a = q('.shop-menu__account'); return a ? {hidden: a.hidden, rect: r(a)} : null; })(),
    counts: {links: links.length, linksFullyInViewport: visible, linksInScrollArea: inScrollView,
             labels: labels.length, dividers: dividers.length, themeBtns: document.querySelectorAll('.shop-menu__theme-btn').length},
    overflow: {docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth,
               drawerSW: drawer ? drawer.scrollWidth : null, drawerCW: drawer ? drawer.clientWidth : null,
               themeSW: theme ? theme.scrollWidth : null, themeCW: theme ? theme.clientWidth : null},
    hdrVarTop: getComputedStyle(document.body).getPropertyValue('--hdrmenu-top').trim()
  };
})()"""

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- قياس المقاسات (القائمة مفتوحة) ----------
    for w, h in [(360, 780), (390, 844), (390, 700), (430, 900), (600, 900), (768, 1000), (1024, 800)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, locale='ar',
                            device_scale_factor=2 if w < 768 else 1)
        page = ctx.new_page()
        page.on('console', lambda m: report['console_errors'].append('console: ' + m.text)
                if m.type == 'error' else None)
        page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1800)
        burger_visible = page.evaluate("(() => { const b = document.getElementById('shop-burger');"
                                      " return b ? getComputedStyle(b).display !== 'none' : false; })()")
        key = '%dx%d' % (w, h)
        if not burger_visible:
            report['sizes'][key] = {'burgerVisible': False}
            print('== %s == burger مخفي (سطح مكتب) — القائمة الجوال غير متاحة' % key)
            ctx.close()
            continue
        page.click('#shop-burger')
        page.wait_for_timeout(900)                       # بعد انتهاء الحركة والتتابع
        page.mouse.move(w / 2, h - 8)                     # إبعاد المؤشر (بلا hover)
        page.wait_for_timeout(200)
        data = page.evaluate(DUMP)
        data['burgerVisible'] = True
        report['sizes'][key] = data
        if key in ('390x844', '390x700', '360x780', '600x900', '768x1000'):
            p = os.path.join(OUT, '%s-menu-%s.png' % (TAG, key))
            page.screenshot(path=p)
            report['shots'].append(p)
        if key == '390x844':
            # التمرير داخل القائمة إلى الأسفل
            page.evaluate("(() => { const s = document.getElementById('shop-menu-scroll');"
                          " if (s) s.scrollTop = s.scrollHeight; })()")
            page.wait_for_timeout(500)
            p = os.path.join(OUT, '%s-menu-390x844-scrolled.png' % TAG)
            page.screenshot(path=p)
            report['shots'].append(p)
            data['scrolledBottom'] = page.evaluate("""(() => {
              const s = document.getElementById('shop-menu-scroll');
              const last = document.querySelector('.shop-drawer__foot .btn');
              const t = document.querySelector('.shop-menu__theme');
              const lr = last ? last.getBoundingClientRect() : null;
              const tr = t ? t.getBoundingClientRect() : null;
              return {scrollTop: s ? Math.round(s.scrollTop) : null,
                      maxScroll: s ? Math.round(s.scrollHeight - s.clientHeight) : null,
                      ctaVisible: lr ? lr.bottom <= window.innerHeight + 0.5 && lr.top >= 0 : null,
                      themeVisible: tr ? tr.bottom <= window.innerHeight + 0.5 && tr.top >= 0 : null};
            })()""")
            page.evaluate("(() => { const s = document.getElementById('shop-menu-scroll'); if (s) s.scrollTop = 0; })()")
            page.wait_for_timeout(300)
        print('== %s == links=%d h=%s' % (key, data['counts']['links'],
              data['links'][0]['rect']['h'] if data['links'] else None))
        ctx.close()

    # ---------- انحدار الوظائف على 390×844 ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.on('console', lambda m: report['console_errors'].append('console: ' + m.text)
            if m.type == 'error' else None)
    page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1800)
    f = {}
    f['before_open'] = page.evaluate("""(() => { const d = document.getElementById('shop-drawer');
      const b = document.getElementById('shop-burger');
      return {hidden: d.hidden, ariaHidden: d.getAttribute('aria-hidden'),
              burgerExpanded: b.getAttribute('aria-expanded'),
              burgerControls: b.getAttribute('aria-controls'), bodyOverflow: getComputedStyle(document.body).overflowY}; })()""")
    page.click('#shop-burger')
    page.wait_for_timeout(800)
    f['after_open'] = page.evaluate("""(() => { const d = document.getElementById('shop-drawer');
      const b = document.getElementById('shop-burger');
      const a = document.activeElement;
      return {open: d.classList.contains('is-open'), ariaHidden: d.getAttribute('aria-hidden'),
              burgerExpanded: b.getAttribute('aria-expanded'),
              activeId: a ? (a.id || a.className || a.tagName) : null,
              activeInDrawer: d.contains(a),
              bodyOverflow: getComputedStyle(document.body).overflowY,
              htmlOverflow: getComputedStyle(document.documentElement).overflowY,
              scrollY: window.scrollY}; })()""")
    # focus trap: Tab عبر كل العناصر ثم العودة
    ids = []
    for _ in range(16):
        page.keyboard.press('Tab')
        page.wait_for_timeout(60)
        ids.append(page.evaluate("""(() => { const a = document.activeElement;
          return {id: a.id || '', cls: String(a.className).slice(0, 40),
                  inDrawer: document.getElementById('shop-drawer').contains(a)}; })()"""))
    f['tab_cycle'] = ids
    # Escape
    page.keyboard.press('Escape')
    page.wait_for_timeout(600)
    f['after_escape'] = page.evaluate("""(() => { const d = document.getElementById('shop-drawer');
      const b = document.getElementById('shop-burger');
      return {hidden: d.hidden, open: d.classList.contains('is-open'),
              burgerExpanded: b.getAttribute('aria-expanded'),
              activeId: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null,
              bodyOverflow: getComputedStyle(document.body).overflowY}; })()""")
    # تبديل المظهر من داخل القائمة
    page.click('#shop-burger')
    page.wait_for_timeout(700)
    page.click(".shop-menu__theme-btn[data-theme-mode='dark']")
    page.wait_for_timeout(500)
    f['theme_dark'] = page.evaluate("""(() => ({theme: document.documentElement.getAttribute('data-theme'),
      pressed: Array.from(document.querySelectorAll('.shop-menu__theme-btn')).map(b => b.getAttribute('aria-pressed')),
      thumb: (() => { const t = document.querySelector('.shop-menu__theme-thumb'); const a = document.querySelector('.shop-menu__theme-btn.is-active');
        return t && a ? {thumbW: Math.round(t.getBoundingClientRect().width), btnW: Math.round(a.getBoundingClientRect().width),
                         thumbX: Math.round(t.getBoundingClientRect().x), btnX: Math.round(a.getBoundingClientRect().x)} : null; })(),
      drawerBg: getComputedStyle(document.getElementById('shop-drawer')).backgroundColor}))()""")
    p = os.path.join(OUT, '%s-menu-390x844-dark.png' % TAG)
    page.screenshot(path=p)
    report['shots'].append(p)
    page.click(".shop-menu__theme-btn[data-theme-mode='system']")
    page.wait_for_timeout(400)
    # اختيار بند تنقل: يُغلق القائمة ويغيّر المسار
    before_hash = page.evaluate('location.hash')
    page.click("#shop-drawer a[href='#/products']")
    page.wait_for_timeout(900)
    f['nav_click'] = {'beforeHash': before_hash,
                      'after': page.evaluate("""(() => ({hash: location.hash,
                        drawerHidden: document.getElementById('shop-drawer').hidden,
                        bodyOverflow: getComputedStyle(document.body).overflowY}))()""")}
    # إعادة الفتح: هل aria-current على البند الحالي؟
    page.click('#shop-burger')
    page.wait_for_timeout(700)
    f['aria_current'] = page.evaluate("""(() => Array.from(document.querySelectorAll('.shop-drawer__link[aria-current]'))
        .map(l => ({text: (l.textContent || '').trim().slice(0, 20), cur: l.getAttribute('aria-current'),
                    bg: getComputedStyle(l).backgroundColor, color: getComputedStyle(l).color})))()""")
    # focus-visible على بند تنقل
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.click('#shop-burger')
    page.wait_for_timeout(700)
    focused = None
    for _ in range(20):
        page.keyboard.press('Tab')
        page.wait_for_timeout(70)
        focused = page.evaluate("""(() => { const a = document.activeElement;
          return {cls: String(a.className), text: (a.textContent || '').trim().slice(0, 20),
                  outline: getComputedStyle(a).outlineStyle + ' ' + getComputedStyle(a).outlineWidth,
                  shadow: getComputedStyle(a).boxShadow}; })()""")
        if 'shop-drawer__link' in focused['cls']:
            break
    f['focus_visible_link'] = focused
    p = os.path.join(OUT, '%s-menu-390x844-focus.png' % TAG)
    page.screenshot(path=p)
    report['shots'].append(p)
    # resize ≥1024 يغلق القائمة
    page.set_viewport_size({'width': 1200, 'height': 844})
    page.wait_for_timeout(700)
    f['resize_1024'] = page.evaluate("""(() => ({w: window.innerWidth,
      hidden: document.getElementById('shop-drawer').hidden,
      open: document.getElementById('shop-drawer').classList.contains('is-open'),
      burgerDisplay: getComputedStyle(document.getElementById('shop-burger')).display}))()""")
    # Search regression
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(500)
    page.click('#shop-search-btn')
    page.wait_for_timeout(700)
    f['search_open'] = page.evaluate("""(() => { const s = document.getElementById('shop-search-sheet');
      const h = document.querySelector('.shop-header');
      return {open: s.classList.contains('is-open'), sheetTop: Math.round(s.getBoundingClientRect().top),
              headerBottom: Math.round(h.getBoundingClientRect().bottom), hidden: s.hidden}; })()""")
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    f['search_closed'] = page.evaluate("document.getElementById('shop-search-sheet').hidden")
    # Cart regression
    f['cart'] = page.evaluate("""(() => { const c = document.getElementById('shop-cart-button');
      return c ? {href: c.getAttribute('href'), w: Math.round(c.getBoundingClientRect().width)} : null; })()""")
    report['functional'] = f
    ctx.close()

    # ---------- المسجّل: قائمة كاملة (بطاقة حساب + بنود الحساب) — حساب QA حقيقي ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.on('console', lambda m: report['console_errors'].append('console: ' + m.text)
            if m.type == 'error' else None)
    page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1600)
    logged = page.evaluate("""async () => {
      try {
        const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
        window.ALW.session.start(res);
        window.ALW.app.refreshShell();
        await window.ALW.app.refreshNotifications(true);
        return true;
      } catch (e) { return String(e); }
    }""")
    page.wait_for_timeout(2400)
    if logged is True:
        page.click('#shop-burger')
        page.wait_for_timeout(900)
        page.mouse.move(195, 836)
        page.wait_for_timeout(200)
        data = page.evaluate(DUMP)
        report['auth'] = data
        p = os.path.join(OUT, '%s-menu-390x844-auth.png' % TAG)
        page.screenshot(path=p)
        report['shots'].append(p)
        print('== auth == links=%d labels=%d' % (data['counts']['links'], data['counts']['labels']))
        for l in data['links']:
            print('   AUTH LINK %-14s h=%s fs=%s pad=%s/%s radius=%s color=%s bg=%s cur=%s' % (
                l['text'], l['rect']['h'], l['css']['font-size'], l['css']['padding-inline-start'],
                l['css']['padding-inline-end'], l['css']['border-radius'], l['css']['color'],
                l['css']['background-color'], l['ariaCurrent']))
        print('   userBlock', data['userBlock'], 'account', data['accountBlock'])
    else:
        report['auth'] = {'login_failed': str(logged)}
        print('== auth == login failed:', logged)
    ctx.close()
    b.close()

path = os.path.join(OUT, 'menu-%s.json' % TAG)
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(report, fh, ensure_ascii=False, indent=2)
print('\nreport:', path)
print('console errors:', len(report['console_errors']))
for e in report['console_errors'][:8]:
    print('  !', e)
print('functional keys:', list(report['functional'].keys()))
