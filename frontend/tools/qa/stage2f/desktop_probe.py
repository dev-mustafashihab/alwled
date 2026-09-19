"""PHASE 2 · STEP 2F — قياس هيدر سطح المكتب (قبل/بعد).

الاستخدام: python3 desktop_probe.py before|after
يغطي: 1024/1100/1280/1366/1440/1920 · Guest/Auth · صفحات متعددة · Dark · Scrolled/Sticky ·
Hover/Focus · الفائض · لقطات. لا يكتب أي بيانات.
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage2f'
os.makedirs(OUT, exist_ok=True)

WIDTHS = [1024, 1100, 1280, 1366, 1440, 1920]
report = {'tag': TAG, 'guest': {}, 'auth': {}, 'pages': {}, 'sticky': {}, 'dark': {},
          'interactions': {}, 'mobile': {}, 'console_errors': [], 'shots': []}

JS = """(() => {
  const px = v => Math.round(v * 100) / 100;
  const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {x: px(b.x), y: px(b.y), w: px(b.width), h: px(b.height), top: px(b.top), bottom: px(b.bottom),
            left: px(b.left), right: px(b.right)}; };
  const C = (el, ps) => { if (!el) return null; const c = getComputedStyle(el); const o = {};
    ps.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const vis = el => { if (!el) return false; const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const inner = q('.shop-header__inner');
  const header = q('.shop-header');
  const brand = q('.shop-header .shop-brand');
  const logo = q('.shop-brand__logo');
  const divider = q('.shop-header__divider');
  const nav = q('.shop-nav');
  const navLinks = qa('.shop-nav__link').filter(vis);
  const search = q('.shop-search');
  const searchInput = q('.shop-search__input');
  const searchBtn = q('.shop-search__btn');
  const actions = q('.shop-actions');
  const actionKids = actions ? Array.from(actions.children).filter(vis) : [];
  const cart = q('#shop-cart-button');
  const badge = q('.shop-cartbtn__badge, .shop-bell__badge');
  const userBtn = q('#shop-user-btn');
  const bell = q('#shop-bell');
  const gap = (a, b) => { if (!a || !b) return null; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return px(Math.abs(rb.left - ra.right) < 1 ? ra.left - rb.right : (ra.left > rb.left ? ra.left - rb.right : rb.left - ra.right)); };
  const innerBox = inner.getBoundingClientRect();
  const contentRight = Math.max(...[brand, nav, search, actions, divider].filter(Boolean).map(e => e.getBoundingClientRect().right));
  const contentLeft = Math.min(...[brand, nav, search, actions, divider].filter(Boolean).map(e => e.getBoundingClientRect().left));
  return {
    viewport: {w: window.innerWidth, h: window.innerHeight},
    header: R(header), headerCss: C(header, ['background-color', 'border-bottom-width', 'border-bottom-color',
      'box-shadow', 'position', 'backdrop-filter', 'height']),
    inner: R(inner), innerCss: C(inner, ['max-width', 'padding-inline-start', 'padding-inline-end', 'gap', 'height']),
    innerContent: {left: px(contentLeft), right: px(contentRight),
                   leftInset: px(contentLeft - innerBox.left), rightInset: px(innerBox.right - contentRight)},
    brand: R(brand), brandCss: C(brand, ['min-height', 'gap', 'color']),
    logo: R(logo), logoCss: C(logo, ['width', 'height', 'border-radius']),
    brandText: (() => { const s = q('.shop-brand__text strong'), m = q('.shop-brand__text small');
      return {strong: s ? {text: s.textContent.trim(), css: C(s, ['font-size', 'font-weight', 'color'])} : null,
              small: m ? {text: m.textContent.trim(), css: C(m, ['font-size', 'color', 'display'])} : null}; })(),
    divider: divider ? {rect: R(divider), css: C(divider, ['height', 'width', 'background-color']), visible: vis(divider)} : null,
    nav: nav ? {rect: R(nav), css: C(nav, ['display', 'gap', 'align-items']), visible: vis(nav)} : null,
    navLinks: navLinks.map(l => ({text: l.textContent.trim(), rect: R(l), cur: l.getAttribute('aria-current'),
      css: C(l, ['font-size', 'font-weight', 'color', 'background-color', 'padding-inline-start', 'padding-inline-end',
        'padding-top', 'padding-bottom', 'border-radius', 'text-decoration-line']),
      underline: C(l, ['text-decoration-line', 'text-underline-offset', 'border-bottom-width'])})),
    navGap: navLinks.length > 1 ? px(navLinks[0].getBoundingClientRect().left - navLinks[1].getBoundingClientRect().right) : null,
    navToSearchGap: (nav && search && vis(search)) ? px(nav.getBoundingClientRect().left - search.getBoundingClientRect().right) : null,
    brandToNavGap: brand ? (divider ? px(brand.getBoundingClientRect().left - divider.getBoundingClientRect().right)
                                    : (navLinks.length ? px(brand.getBoundingClientRect().left - navLinks[0].getBoundingClientRect().right) : null)) : null,
    dividerToNavGap: divider && navLinks.length ? px(divider.getBoundingClientRect().left - navLinks[0].getBoundingClientRect().right) : null,
    search: search ? {rect: R(search), css: C(search, ['display', 'flex', 'gap', 'margin-inline-start']), visible: vis(search)} : null,
    searchInput: searchInput ? {rect: R(searchInput), css: C(searchInput, ['height', 'font-size', 'background-color',
      'border-top-width', 'border-top-color', 'border-radius', 'color', 'padding-inline-start', 'padding-inline-end']),
      placeholder: searchInput.getAttribute('placeholder')} : null,
    searchBtn: searchBtn ? {rect: R(searchBtn), text: searchBtn.textContent.trim(),
      css: C(searchBtn, ['height', 'min-height', 'background-color', 'color', 'border-radius', 'font-size', 'padding-inline-start'])} : null,
    searchToActionsGap: (search && actions && vis(search)) ? px(search.getBoundingClientRect().left - actions.getBoundingClientRect().right) : null,
    spacer: (() => { const sp = q('.shop-header__spacer'); return sp ? R(sp) : null; })(),
    actions: actions ? {rect: R(actions), css: C(actions, ['gap', 'display'])} : null,
    actionKids: actionKids.map(k => ({tag: k.tagName, cls: String(k.className).slice(0, 40), text: (k.textContent || '').trim().slice(0, 20),
      href: k.getAttribute('href'), rect: R(k),
      css: C(k, ['height', 'min-height', 'width', 'min-width', 'background-color', 'color', 'border-top-width', 'border-top-color', 'border-radius', 'font-size', 'padding-inline-start', 'padding-inline-end']),
      aria: k.getAttribute('aria-label')})),
    cart: cart ? {rect: R(cart), href: cart.getAttribute('href'), aria: cart.getAttribute('aria-label'),
      css: C(cart, ['width', 'height', 'background-color', 'color', 'border-top-color', 'border-radius'])} : null,
    cartIcon: cart && cart.querySelector('svg') ? R(cart.querySelector('svg')) : null,
    cartLabel: (() => { const l = q('.shop-cartbtn__label'); return l ? {text: l.textContent.trim(), display: getComputedStyle(l).display} : null; })(),
    badge: badge ? {rect: R(badge), text: badge.textContent.trim(), css: C(badge, ['min-width', 'height', 'font-size', 'background-color', 'color', 'border-top-color'])} : null,
    userBtn: userBtn ? {rect: R(userBtn), aria: userBtn.getAttribute('aria-label'), title: userBtn.getAttribute('title'),
      css: C(userBtn, ['width', 'height', 'background-color', 'color', 'border-top-color', 'border-radius'])} : null,
    bell: bell ? {rect: R(bell), aria: bell.getAttribute('aria-label')} : null,
    burger: (() => { const b = q('#shop-burger'); return b ? {display: getComputedStyle(b).display, rect: R(b)} : null; })(),
    overflow: {doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
               header: header.scrollWidth - header.clientWidth, inner: inner.scrollWidth - inner.clientWidth},
    activeNav: navLinks.filter(l => l.getAttribute('aria-current')).map(l => l.textContent.trim()),
    wrap: (() => { const kids = Array.from(inner.children).filter(vis);
      const tops = new Set(kids.map(k => Math.round(k.getBoundingClientRect().top)));
      return {childCount: kids.length, distinctTops: tops.size}; })(),
    scrollY: px(window.scrollY),
    isScrolled: header.classList.contains('is-scrolled'),
    theme: document.documentElement.getAttribute('data-theme')
  };
})()"""

LOGIN = """async () => { try { const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
  window.ALW.session.start(res); window.ALW.app.refreshShell(); await window.ALW.app.refreshNotifications(true);
  return true; } catch (e) { return String(e); } }"""


def shoot(page, name):
    p = os.path.join(OUT, '%s-%s.png' % (TAG, name))
    page.screenshot(path=p)
    report['shots'].append(p)
    return p


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- Guest: كل العروض ----------
    for w in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.on('console', lambda m: report['console_errors'].append('console: ' + m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1700)
        report['guest'][str(w)] = page.evaluate(JS)
        if w in (1024, 1366, 1440):
            shoot(page, 'guest-%d-top' % w)
            page.evaluate('window.scrollTo(0, 600)')
            page.wait_for_timeout(500)
            report['guest'][str(w) + '_scrolled'] = page.evaluate(JS)
            shoot(page, 'guest-%d-scrolled' % w)
            page.evaluate('window.scrollTo(0, 0)')
        print('guest %d: h=%s inner=%s nav=%s search=%s cart=%s ov=%s active=%s' % (
            w, report['guest'][str(w)]['header']['h'], report['guest'][str(w)]['inner']['w'],
            len(report['guest'][str(w)]['navLinks']), report['guest'][str(w)]['search'] and report['guest'][str(w)]['search']['rect']['w'],
            report['guest'][str(w)]['cart'] and report['guest'][str(w)]['cart']['rect']['w'],
            report['guest'][str(w)]['overflow']['doc'], report['guest'][str(w)]['activeNav']))
        ctx.close()

    # ---------- Sticky + interactions على 1366 ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1700)
    maxs = page.evaluate('document.documentElement.scrollHeight - window.innerHeight')
    for y in [0, 200, 600, 900, 1500, int(maxs)]:
        page.evaluate('window.scrollTo(0, %d)' % y)
        page.wait_for_timeout(400)
        report['sticky'][str(y)] = page.evaluate("""(() => { const h = document.querySelector('.shop-header').getBoundingClientRect();
          return {scrollY: Math.round(window.scrollY), headerTop: Math.round(h.top), headerBottom: Math.round(h.bottom),
                  height: Math.round(h.height), isScrolled: document.querySelector('.shop-header').classList.contains('is-scrolled'),
                  shadow: getComputedStyle(document.querySelector('.shop-header')).boxShadow,
                  bg: getComputedStyle(document.querySelector('.shop-header')).backgroundColor,
                  border: getComputedStyle(document.querySelector('.shop-header')).borderBottomColor}; })()""")
    print('sticky:', {k: (v['headerTop'], v['height'], v['isScrolled']) for k, v in report['sticky'].items()})
    # hover على رابط تنقل
    page.evaluate('window.scrollTo(0, 0)')
    page.wait_for_timeout(300)
    nav2 = page.locator('.shop-nav__link').nth(1)
    nav2.hover()
    page.wait_for_timeout(400)
    report['interactions']['nav_hover'] = page.evaluate("""(() => { const l = document.querySelectorAll('.shop-nav__link')[1];
      const c = getComputedStyle(l); return {text: l.textContent.trim(), color: c.color, bg: c.backgroundColor,
      weight: c.fontWeight, rect: (() => { const b = l.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height)}; })()}; })()""")
    # focus كيبورد على رابط تنقل
    page.mouse.move(5, 500)
    foc = None
    for _ in range(14):
        page.keyboard.press('Tab')
        page.wait_for_timeout(70)
        foc = page.evaluate("""(() => { const a = document.activeElement; const c = getComputedStyle(a);
          return {cls: String(a.className), id: a.id, text: (a.textContent || '').trim().slice(0, 16),
                  outline: c.outlineStyle + ' ' + c.outlineWidth + ' ' + c.outlineColor, shadow: c.boxShadow,
                  border: c.borderTopColor, rect: (() => { const b = a.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height)}; })()}; })()""")
        if 'shop-nav__link' in foc['cls']:
            break
    report['interactions']['nav_focus'] = foc
    shoot(page, 'guest-1366-focus')
    # focus على البحث
    page.click('.shop-search__input')
    page.wait_for_timeout(300)
    report['interactions']['search_focus'] = page.evaluate("""(() => { const i = document.querySelector('.shop-search__input');
      const c = getComputedStyle(i); return {border: c.borderTopColor, shadow: c.boxShadow, outline: c.outlineStyle + ' ' + c.outlineWidth}; })()""")
    ctx.close()

    # ---------- اختبار انزياح شارة السلة (1/2/3 أرقام) — حقن محلي في سياق الفحص فقط ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1700)
    report['badge_test'] = page.evaluate("""(() => {
      const cart = document.getElementById('shop-cart-button');
      const inner = document.querySelector('.shop-header__inner');
      const nav = document.querySelector('.shop-nav');
      const snap = () => ({inner: Math.round(inner.getBoundingClientRect().width),
        innerScroll: inner.scrollWidth - inner.clientWidth,
        navRight: Math.round(nav.getBoundingClientRect().right),
        cartLeft: Math.round(cart.getBoundingClientRect().left),
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth});
      const out = {empty: snap()};
      const mk = (txt) => { const b = document.createElement('span');
        b.className = 'shop-cartbtn__badge'; b.id = 'qa-badge'; b.textContent = txt; return b; };
      for (const t of ['1', '12', '99+']) {
        const old = document.getElementById('qa-badge'); if (old) old.remove();
        cart.appendChild(mk(t));
        const cs = getComputedStyle(document.getElementById('qa-badge'));
        out['badge_' + t] = Object.assign(snap(), {badgeW: Math.round(document.getElementById('qa-badge').getBoundingClientRect().width),
          badgeH: Math.round(document.getElementById('qa-badge').getBoundingClientRect().height),
          minW: cs.minWidth, fs: cs.fontSize, bg: cs.backgroundColor, border: cs.borderTopColor});
      }
      const old = document.getElementById('qa-badge'); if (old) old.remove();
      out.after_removal = snap();
      return out;
    })()""")
    print('badge_test:', {k: (v.get('innerScroll'), v.get('docOverflow'), v.get('badgeW')) for k, v in report['badge_test'].items()})
    ctx.close()

    # ---------- Dark ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1700)
    report['dark']['top'] = page.evaluate(JS)
    shoot(page, 'dark-1366-top')
    page.evaluate('window.scrollTo(0, 600)')
    page.wait_for_timeout(500)
    report['dark']['scrolled'] = page.evaluate(JS)
    ctx.close()

    # ---------- Auth ----------
    for w in (1024, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.on('console', lambda m: report['console_errors'].append('console: ' + m.text) if m.type == 'error' else None)
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1500)
        ok = page.evaluate(LOGIN)
        page.wait_for_timeout(2400)
        if ok is not True:
            report['auth'][str(w)] = {'login_failed': str(ok)}
        else:
            report['auth'][str(w)] = page.evaluate(JS)
            shoot(page, 'auth-%d-top' % w)
            # اسم طويل: نختبر CSS بلا تغيير بيانات — قياس فقط لعنصر الاسم الحقيقي
            report['auth'][str(w)]['userTitle'] = page.evaluate("""(() => { const u = document.getElementById('shop-user-btn');
              return u ? {title: u.getAttribute('title'), w: Math.round(u.getBoundingClientRect().width)} : null; })()""")
        print('auth %d: %s' % (w, 'ok' if ok is True else ok))
        ctx.close()

    # ---------- صفحات (Guest 1366) ----------
    for name, hash in [('home', '#/'), ('products', '#/products'), ('categories', '#/products?view=categories'),
                       ('brands', '#/products?view=brands'), ('cart', '#/cart'), ('login', '#/login')]:
        ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1600)
        page.evaluate('location.hash = "%s"' % hash)
        page.wait_for_timeout(1600)
        report['pages'][name] = page.evaluate("""(() => { const links = Array.from(document.querySelectorAll('.shop-nav__link'));
          const inner = document.querySelector('.shop-header__inner');
          const kids = Array.from(inner.children).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0; });
          const tops = new Set(kids.map(k => Math.round(k.getBoundingClientRect().top)));
          const active = links.filter(l => l.getAttribute('aria-current'));
          return {hash: location.hash, active: active.map(l => l.textContent.trim()),
                  activeCount: active.length,
                  activeCss: active.length ? (() => { const c = getComputedStyle(active[0]);
                    return {color: c.color, bg: c.backgroundColor, weight: c.fontWeight, decoration: c.textDecorationLine}; })() : null,
                  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
                  distinctTops: tops.size}; })()""")
        print('page %s: %s' % (name, report['pages'][name]))
        ctx.close()

    # ---------- Mobile regression (390) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1700)
    report['mobile']['header'] = page.evaluate("""(() => { const q = s => document.querySelector(s);
      const R = el => { const b = el.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height)}; };
      return {headerH: Math.round(q('.shop-header').getBoundingClientRect().height),
              logo: R(q('.shop-brand__logo')), brand: R(q('.shop-header .shop-brand')),
              burger: R(q('#shop-burger')), cart: R(q('#shop-cart-button')), searchBtn: R(q('#shop-search-btn')),
              navVisible: getComputedStyle(q('.shop-nav')).display, formVisible: getComputedStyle(q('.shop-search')).display,
              innerGap: getComputedStyle(q('.shop-header__inner')).gap,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()""")
    shoot(page, 'mobile-390-header')
    page.click('#shop-search-btn')
    page.wait_for_timeout(1200)
    page.type('#shop-search-sheet-input', 'ثلاجة', delay=30)
    page.wait_for_timeout(1500)
    report['mobile']['search'] = page.evaluate("""(() => { const s = document.getElementById('shop-search-sheet');
      const h = document.querySelector('.shop-header');
      const row = document.querySelector('.shop-search-row');
      const inp = document.querySelector('.shop-search-sheet__input');
      const clr = document.getElementById('shop-search-clear');
      return {sheetTop: Math.round(s.getBoundingClientRect().top), headerBottom: Math.round(h.getBoundingClientRect().bottom),
              rowH: row ? Math.round(row.getBoundingClientRect().height) : null,
              inputH: Math.round(inp.getBoundingClientRect().height), inputBg: getComputedStyle(inp).backgroundColor,
              clearW: Math.round(clr.getBoundingClientRect().width),
              sheetBg: getComputedStyle(s).backgroundColor}; })()""")
    shoot(page, 'mobile-390-search')
    page.keyboard.press('Escape')
    page.wait_for_timeout(600)
    page.click('#shop-burger')
    page.wait_for_timeout(800)
    report['mobile']['menu'] = page.evaluate("""(() => { const d = document.getElementById('shop-drawer');
      const r = document.querySelector('.shop-drawer__link');
      const t = document.querySelector('.shop-menu__theme');
      return {open: d.classList.contains('is-open'), rowH: Math.round(r.getBoundingClientRect().height),
              themeH: Math.round(t.getBoundingClientRect().height),
              drawerTop: Math.round(d.getBoundingClientRect().top)}; })()""")
    shoot(page, 'mobile-390-menu')
    ctx.close()
    b.close()

path = os.path.join(OUT, 'desktop-%s.json' % TAG)
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(report, fh, ensure_ascii=False, indent=2)
print('report:', path)
print('console errors:', len(report['console_errors']))
print('shots:', len(report['shots']))
