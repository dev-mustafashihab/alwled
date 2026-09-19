"""فحص تبسيط هيدر الجوال: 4 عناصر فقط + نقل الجرس والحساب إلى القائمة مع الشارات."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
fails = []


def check(name, ok, detail=''):
    print(('  ✓ ' if ok else '  ✗ ') + name + ((' — ' + str(detail)) if detail != '' else ''))
    if not ok:
        fails.append(name)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- جوال + مسجّل ----------
    page = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2).new_page()
    errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    page.evaluate("""async () => {
      const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
      window.ALW.session.start(res);
      window.ALW.app.refreshShell();
      await window.ALW.app.refreshNotifications(true);
    }""")
    page.wait_for_timeout(2200)

    header = page.evaluate("""(() => {
      const vis = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const inner = document.querySelector('.shop-header__inner');
      // عناصر تفاعلية فقط (لا تحسب حاوية .shop-actions)
      const items = Array.from(inner.querySelectorAll('a, button, .shop-brand')).filter(vis);
      return {count: items.length,
              labels: items.map(n => (n.getAttribute('aria-label') || n.innerText || '').trim().slice(0, 22)),
              bellVisible: !!(document.getElementById('shop-bell') || {}).offsetParent,
              userVisible: !!(document.getElementById('shop-user-btn') || {}).offsetParent,
              searchVisible: !!document.getElementById('shop-search-btn').offsetParent,
              cartVisible: !!document.getElementById('shop-cart-button').offsetParent,
              burgerVisible: !!document.getElementById('shop-burger').offsetParent,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
    })()""")
    check('mobile header = burger + brand + search + cart only', header['count'] == 4, header)
    check('mobile header: no bell, no account button', (not header['bellVisible']) and (not header['userVisible']), header)
    check('mobile header: search/cart/burger all visible', header['searchVisible'] and header['cartVisible'] and header['burgerVisible'], header)
    check('mobile header: no horizontal overflow', header['overflow'] <= 0, header['overflow'])
    page.screenshot(path='/root/alwled/frontend/tools/qa/stage15.2/header-simple-390.png')

    # القائمة الجانبية: الجرس + بنود الحساب + الشارة = عدد الـBackend
    api_count = page.evaluate("""async () => {
      const r = await window.ALW.shop.api.unreadCount();
      return (r && typeof r.count === 'number') ? r.count : null;
    }""")
    page.click('#shop-burger')
    page.wait_for_timeout(700)
    menu = page.evaluate("""(() => {
      const box = document.getElementById('shop-menu-account');
      const rows = box ? Array.from(box.querySelectorAll('.shop-drawer__link')) : [];
      const vis = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const sizes = rows.map(r => Math.round(r.getBoundingClientRect().height));
      const badge = document.getElementById('shop-bell-badge');
      return {hidden: box ? box.hidden : null,
              labels: rows.map(r => (r.innerText || '').trim().replace(/\\s+/g, ' ')),
              sizes: sizes, allVisible: rows.length ? rows.every(vis) : false,
              badge: badge ? badge.textContent : null,
              badgeVisible: badge ? vis(badge) : null,
              guestHidden: (document.getElementById('shop-menu-guest') || {}).hidden,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
    })()""")
    check('menu: account section visible for authed user', menu['hidden'] is False, menu)
    check('menu: bell + account rows present (5)', len(menu['labels']) == 5, menu['labels'])
    check('menu: rows touch >= 44px and visible', menu['allVisible'] and all(s >= 44 for s in menu['sizes']), menu['sizes'])
    badge_ok = (str(menu['badge']) == str(api_count)) or (api_count == 0 and menu['badge'] is None)
    check('menu: bell badge matches backend count (0 ⇒ لا شارة)', badge_ok, 'menu=%s api=%s' % (menu['badge'], api_count))
    check('menu: guest section hidden when authed', menu['guestHidden'] is True, menu)
    check('menu: no horizontal overflow', menu['overflow'] <= 0, menu['overflow'])
    page.screenshot(path='/root/alwled/frontend/tools/qa/stage15.2/menu-account-390.png')

    # بند الإشعارات ينقل فعلاً
    page.locator("#shop-menu-account a[href='#/notifications']").click()
    page.wait_for_timeout(1400)
    nav = page.evaluate("""(() => ({hash: location.hash,
      open: document.getElementById('shop-drawer').classList.contains('is-open'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    check('menu bell navigates to notifications & closes menu', nav['hash'] == '#/notifications' and not nav['open'], nav)
    check('notifications page: no overflow', nav['overflow'] <= 0, nav['overflow'])

    # خروج من القائمة يعمل
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.click('#shop-burger')
    page.wait_for_timeout(600)
    page.locator('.shop-drawer__link--danger').click()
    page.wait_for_timeout(1800)
    after = page.evaluate("""(() => ({authed: document.body.classList.contains('is-authed'),
      userVisible: !!(document.getElementById('shop-user-btn') || {}).offsetParent,
      guestHidden: (document.getElementById('shop-menu-guest') || {}).hidden}))()""")
    check('logout from menu works (session cleared)', after['authed'] is False, after)

    # زائر: قسم الزائر يظهر ولا يظهر قسم حسابي
    page.wait_for_timeout(600)
    guest = page.evaluate("""(() => ({guestHidden: (document.getElementById('shop-menu-guest') || {}).hidden,
      accountHidden: (document.getElementById('shop-menu-account') || {}).hidden,
      loginLinks: document.querySelectorAll("#shop-drawer a[href='#/login']").length}))()""")
    check('guest: guest section shown, account section hidden', guest['guestHidden'] is False and guest['accountHidden'] is True and guest['loginLinks'] == 1, guest)
    check('no console errors', len([e for e in errs if '401' not in e]) == 0, errs[:2])
    page.close()

    # ---------- ديسكتوب: بلا تغيير ----------
    page = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ar').new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate("""async () => {
      const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
      window.ALW.session.start(res); window.ALW.app.refreshShell();
      await window.ALW.app.refreshNotifications(true);
    }""")
    page.wait_for_timeout(2200)
    desk = page.evaluate("""(() => ({
      bellVisible: !!(document.getElementById('shop-bell') || {}).offsetParent,
      userVisible: !!(document.getElementById('shop-user-btn') || {}).offsetParent,
      navLinks: document.querySelectorAll('.shop-nav__link').length,
      searchVisible: !!document.querySelector('.shop-search').offsetParent,
      burgerVisible: !!document.getElementById('shop-burger').offsetParent,
      badge: (document.getElementById('shop-bell-badge-desktop') || {}).textContent || null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    check('desktop unchanged: bell + account + nav + search visible', desk['bellVisible'] and desk['userVisible'] and desk['navLinks'] == 4 and desk['searchVisible'], desk)
    check('desktop: burger hidden, no overflow', (not desk['burgerVisible']) and desk['overflow'] <= 0, desk)
    page.close()
    b.close()

print('\nMOBILE HEADER SIMPLIFICATION:', 'PASS' if not fails else 'FAIL (%d)' % len(fails))
for f in fails:
    print('  ✗', f)
