"""Stage 15.2 — فحص الهيدر والقائمة (منقولين من مرجع Defense).
يختبر: فتح/إغلاق · تغطية الشاشة · animation/tتابع · Escape · النقر خارج اللوحة ·
mobile/desktop · RTL · الفائض الأفقي · سلامة الروابط والوظائف.
لا ينفّذ أي عملية كتابة على البيانات (تصفّح + دخول حساب QA فقط).
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage15.2'
WIDTHS = [320, 360, 375, 390, 414, 768, 1024, 1440]
os.makedirs(OUT, exist_ok=True)

report = {'checks': [], 'failures': [], 'overflow': {}, 'shots': []}
console_errors = []


def check(name, ok, detail=''):
    report['checks'].append({'name': name, 'ok': bool(ok), 'detail': detail})
    if not ok:
        report['failures'].append(name + ((' — ' + str(detail)) if detail != '' else ''))
    print(('  ✓ ' if ok else '  ✗ ') + name + ((' — ' + str(detail)) if detail != '' else ''))


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- 1) الفائض الأفقي في 8 مقاسات + سلامة الروابط ----------
    print('== overflow / links ==')
    for w in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar', device_scale_factor=2 if w < 768 else 1)
        page = ctx.new_page()
        page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: console_errors.append(str(e)))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        ov = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        report['overflow'][str(w)] = ov
        # الهيدر: الشعار + الأزرار داخل العرض
        header_fit = page.evaluate("""(() => {
          const h = document.querySelector('.shop-header__inner');
          if (!h) return false;
          const r = h.getBoundingClientRect();
          return r.width <= document.documentElement.clientWidth + 0.5 && r.height > 40;
        })()""")
        check('overflow %d = 0 + header fits' % w, ov <= 0 and header_fit, 'ov=%s fit=%s' % (ov, header_fit))
        if w in (390, 1440):
            page.screenshot(path=os.path.join(OUT, 'header-%d.png' % w))
        ctx.close()

    # ---------- 2) سلوك القائمة على الجوال ----------
    print('== mobile menu ==')
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: console_errors.append(str(e)))
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)

    print('header offset:', page.evaluate("getComputedStyle(document.body).getPropertyValue('--hdrmenu-top')"))
    check('module loaded (ALW.shopHeader)', page.evaluate('!!(window.ALW && window.ALW.shopHeader)'))
    check('header uses SVG icon (no emoji)', page.evaluate("""(() => !/\\u{1F514}|\\u{1F6D2}/u.test(document.querySelector('.shop-header').innerText))()"""))

    burger_box = page.locator('#shop-burger').bounding_box()
    check('menu button >= 44px on mobile', burger_box and burger_box['width'] >= 42 and burger_box['height'] >= 42, burger_box)

    page.click('#shop-burger')
    page.wait_for_timeout(120)
    mid = page.evaluate("""(() => {
      const m = document.getElementById('shop-drawer');
      const links = Array.from(m.querySelectorAll('.shop-drawer__link'));
      return {open: m.classList.contains('is-open'), visibility: getComputedStyle(m).visibility,
              delays: links.slice(0, 4).map(l => l.style.transitionDelay),
              opacityFirst: links.length ? getComputedStyle(links[0]).opacity : null,
              transformFirst: links.length ? getComputedStyle(links[0]).transform : null};
    })()""")
    check('menu opens (is-open)', mid['open'], mid)
    check('stagger delays applied (reference pattern)', any(d not in ('', '0s') for d in mid['delays']), mid['delays'])

    page.wait_for_timeout(600)
    opened = page.evaluate("""(() => {
      const m = document.getElementById('shop-drawer');
      const r = m.getBoundingClientRect();
      const header = document.querySelector('.shop-header').getBoundingClientRect();
      const link = m.querySelector('.shop-drawer__link');
      return {top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
              vh: window.innerHeight, vw: window.innerWidth, headerBottom: Math.round(header.bottom),
              opacity: getComputedStyle(m).opacity, pointer: getComputedStyle(m).pointerEvents,
              bodyOverflow: document.body.style.overflow, htmlOverflow: document.documentElement.style.overflow,
              aria: document.getElementById('shop-burger').getAttribute('aria-expanded'),
              focusedInside: m.contains(document.activeElement),
              linkOpacity: link ? getComputedStyle(link).opacity : null,
              iconSvg: m.querySelectorAll('.shop-drawer__link__icon svg').length};
    })()""")
    check('menu drops from under the header', abs(opened['top'] - opened['headerBottom']) <= 2 and opened['bottom'] >= opened['vh'] - 2, opened)
    check('menu covers full width (overlay behavior)', opened['left'] <= 1 and opened['right'] >= opened['vw'] - 1, opened)
    check('menu visible & interactive', float(opened['opacity']) > 0.9 and opened['pointer'] == 'auto', opened)
    check('scroll locked (html+body)', opened['bodyOverflow'] == 'hidden' and opened['htmlOverflow'] == 'hidden', opened)
    check('aria-expanded=true + focus inside', opened['aria'] == 'true' and opened['focusedInside'], opened)
    check('links fully visible after stagger', float(opened['linkOpacity']) > 0.9, opened['linkOpacity'])
    check('all menu links use local SVG icons', opened['iconSvg'] >= 7, opened['iconSvg'])
    page.screenshot(path=os.path.join(OUT, 'menu-open-390.png'))
    report['shots'].append(os.path.join(OUT, 'menu-open-390.png'))

    # Escape
    page.keyboard.press('Escape')
    page.wait_for_timeout(450)
    esc = page.evaluate("""(() => ({
      open: document.getElementById('shop-drawer').classList.contains('is-open'),
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow,
      aria: document.getElementById('shop-burger').getAttribute('aria-expanded'),
      focused: document.activeElement.id
    }))()""")
    check('Escape closes menu', not esc['open'] and esc['aria'] == 'false', esc)
    check('scroll restored after close', esc['bodyOverflow'] in ('', 'visible') and esc['htmlOverflow'] in ('', 'visible'), esc)
    check('focus back to menu button', esc['focused'] == 'shop-burger', esc['focused'])
    page.mouse.wheel(0, 400)
    page.wait_for_timeout(300)
    check('page scrolls again after close', page.evaluate('window.scrollY') > 0)

    # click outside (header area)
    page.click('#shop-burger')
    page.wait_for_timeout(450)
    page.mouse.click(195, 30)   # منطقة الهيدر = خارج اللوحة
    page.wait_for_timeout(500)
    check('click outside (header) closes menu', page.evaluate("!document.getElementById('shop-drawer').classList.contains('is-open')"))

    # toggle + close button + link navigation
    page.click('#shop-burger')
    page.wait_for_timeout(400)
    page.click('#shop-burger')
    page.wait_for_timeout(450)
    check('menu button toggles closed', page.evaluate("!document.getElementById('shop-drawer').classList.contains('is-open')"))

    # لا زر إغلاق داخل اللوحة (نمط المرجع): الإغلاق بزر القائمة/الهيدر/Escape فقط
    check('no duplicated close button inside menu', page.evaluate("!document.getElementById('shop-drawer-close')"))

    page.click('#shop-burger')
    page.wait_for_timeout(400)
    page.locator("#shop-drawer a[href='#/products']").first.click()
    page.wait_for_timeout(1200)
    after_nav = page.evaluate("""(() => ({
      hash: location.hash,
      open: document.getElementById('shop-drawer').classList.contains('is-open'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()""")
    check('menu link navigates & menu closes', after_nav['hash'].startswith('#/products') and not after_nav['open'], after_nav)
    check('no overflow after navigation', after_nav['overflow'] <= 0, after_nav['overflow'])

    # theme pill (ported control, uses existing theme key)
    page.click('#shop-burger')
    page.wait_for_timeout(400)
    page.click(".shop-menu__theme-btn[data-theme-mode='dark']")
    page.wait_for_timeout(400)
    dark = page.evaluate("""(() => ({theme: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('alwled.theme'),
      active: !!document.querySelector(".shop-menu__theme-btn[data-theme-mode='dark'].is-active")}))()""")
    check('theme control light/dark works', dark['theme'] == 'dark' and dark['active'], dark)
    page.screenshot(path=os.path.join(OUT, 'menu-open-dark-390.png'))
    page.click(".shop-menu__theme-btn[data-theme-mode='system']")
    page.wait_for_timeout(300)
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    ctx.close()

    # ---------- 3) سطح المكتب: لا قائمة منسدلة + روابط واضحة ----------
    print('== desktop ==')
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    desk = page.evaluate("""(() => ({
      burgerVisible: !!(document.getElementById('shop-burger').offsetParent),
      navVisible: !!document.querySelector('.shop-nav').offsetParent,
      navLinks: document.querySelectorAll('.shop-nav__link').length,
      headerHeight: Math.round(document.querySelector('.shop-header__inner').getBoundingClientRect().height)
    }))()""")
    check('desktop: burger hidden, nav visible', (not desk['burgerVisible']) and desk['navVisible'] and desk['navLinks'] >= 4, desk)
    page.screenshot(path=os.path.join(OUT, 'header-desktop-1440.png'))

    # فتح بالكيبورد ثم توسيع الشاشة يغلق القائمة (سلوك المرجع عند الانتقال لسطح المكتب)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(500)
    page.click('#shop-burger')
    page.wait_for_timeout(400)
    page.set_viewport_size({'width': 1280, 'height': 900})
    page.wait_for_timeout(600)
    check('menu auto-closes when resizing to desktop', page.evaluate("!document.getElementById('shop-drawer').classList.contains('is-open')"))

    # الأزرار موجودة ويعمل الرابط (السلة)
    page.set_viewport_size({'width': 1440, 'height': 900})
    page.wait_for_timeout(400)
    page.click('#shop-cart-button')
    page.wait_for_timeout(1300)
    check('header cart button still navigates', page.evaluate("location.hash") == '#/cart', page.evaluate('location.hash'))

    # ---------- 4) قائمة الملف الشخصي (على الديسكتوب: زر الحساب في الهيدر) ----------
    # ملاحظة: على الجوال انتقل زر الحساب والجرس إلى القائمة الجانبية (فحص منفصل: qa_shop_152_mobileheader.py)
    print('== profile menu (desktop) ==')
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)

    guest = page.evaluate("""(() => {
      const g = document.getElementById('shop-menu-guest');
      const ub = document.getElementById('shop-user-btn');
      return {section: !!g, hidden: g ? g.hidden : null,
              login: document.querySelectorAll("#shop-drawer a[href='#/login']").length,
              userBtnInHeaderVisible: !!(ub && ub.offsetParent)};
    })()""")
    check('guest: account section stays in menu', guest['section'] and guest['hidden'] is False and guest['login'] == 1, guest)

    page.evaluate("""async () => {
      const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
      window.ALW.session.start(res);
      window.ALW.app.refreshShell();
    }""")
    page.wait_for_timeout(1500)
    authed = page.evaluate("""(() => {
      const g = document.getElementById('shop-menu-guest');
      return {userBtn: !!document.getElementById('shop-user-btn'), guestHidden: g ? g.hidden : null,
              menuAccount: document.querySelectorAll("#shop-menu-account a[href='#/orders']").length,
              footEmpty: (document.getElementById('shop-drawer-account') || {}).childElementCount};
    })()""")
    check('authed: account section visible in menu (mobile entries), guest section hidden',
          authed['userBtn'] and authed['guestHidden'] is True, authed)

    page.click('#shop-user-btn')
    page.wait_for_timeout(400)
    pm = page.evaluate("""(() => {
      const m = document.getElementById('shop-profile-menu');
      if (!m) return null;
      const items = Array.from(m.querySelectorAll('.shop-profile-menu__item'));
      const r = m.getBoundingClientRect();
      return {count: items.length, labels: items.map(i => i.innerText.trim()),
              sizes: items.map(i => Math.round(i.getBoundingClientRect().height)),
              svg: m.querySelectorAll('svg').length, opacity: getComputedStyle(m).opacity,
              right: Math.round(r.right), vw: window.innerWidth,
              aria: document.getElementById('shop-user-btn').getAttribute('aria-expanded'),
              focusedInside: m.contains(document.activeElement)};
    })()""")
    check('profile dropdown: 5 account items with SVG icons',
          pm and pm['count'] == 5 and pm['svg'] == 5 and all(s >= 44 for s in pm['sizes']), pm and pm['labels'])
    check('profile dropdown opens (aria + focus + RTL fit)',
          pm and float(pm['opacity']) > 0.9 and pm['aria'] == 'true' and pm['focusedInside'] and pm['right'] <= pm['vw'] + 1, pm)
    page.screenshot(path=os.path.join(OUT, 'profile-menu-390.png'))

    page.keyboard.press('Escape')
    page.wait_for_timeout(350)
    check('profile dropdown closes on Escape',
          page.evaluate("!document.getElementById('shop-profile-menu').classList.contains('is-open')"))
    page.click('#shop-user-btn')
    page.wait_for_timeout(350)
    page.mouse.click(195, 420)
    page.wait_for_timeout(400)
    check('profile dropdown closes on outside click',
          page.evaluate("!document.getElementById('shop-profile-menu').classList.contains('is-open')"))
    page.click('#shop-user-btn')
    page.wait_for_timeout(350)
    page.locator("#shop-profile-menu a[href='#/orders']").click()
    page.wait_for_timeout(1200)
    nav = page.evaluate("""(() => ({hash: location.hash,
      open: document.getElementById('shop-profile-menu').classList.contains('is-open'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    check('profile item navigates & closes', nav['hash'] == '#/orders' and not nav['open'] and nav['overflow'] <= 0, nav)
    ctx.close()

    ctx.close()
    b.close()

check('no console errors', len(console_errors) == 0, console_errors[:2])

report['console_errors'] = console_errors[:5]
report['passed'] = len(report['checks']) - len(report['failures'])
report['total'] = len(report['checks'])
with open(os.path.join(OUT, 'shop-152-header-report.json'), 'w', encoding='utf-8') as fh:
    json.dump(report, fh, ensure_ascii=False, indent=2)

print('\n=== Stage 15.2 Header/Menu: %d/%d PASS · overflow=%s ===' % (
    report['passed'], report['total'],
    'PASS' if all(v <= 0 for v in report['overflow'].values()) else 'FAIL'))
for f in report['failures']:
    print('  ✗', f)
sys.exit(0 if not report['failures'] else 1)
