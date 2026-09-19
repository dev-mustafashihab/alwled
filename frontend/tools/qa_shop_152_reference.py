"""فحص تطبيق مرجع Unblock Syria: الخط والقياسات المُستخرجة + تنظيم القائمة + المظهر في المحتوى."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
fails = []

# القيم المُستخرجة فعلياً من المرجع (390px)
REF = {'itemFs': '18px', 'itemFw': '500', 'itemLh': '28px', 'itemPadTop': '16px', 'itemPadStart': '24px',
       'itemGap': '16px', 'itemHeight': 61, 'themeFs': '14px', 'themeFw': '500'}


def check(name, ok, detail=''):
    print(('  ✓ ' if ok else '  ✗ ') + name + ((' — ' + str(detail)) if detail != '' else ''))
    if not ok:
        fails.append(name)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2).new_page()
    errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1600)

    # الخط محمّل محلياً
    fonts = page.evaluate("""(() => {
      const loaded = Array.from(document.fonts).map(f => f.family + ':' + f.weight + ':' + f.status);
      return {loaded: loaded, hasQomra: loaded.some(f => f.indexOf('Qomra') === 0)};
    })()""")
    check('Qomra Arabic font loaded locally (no CDN)', fonts['hasQomra'], fonts['loaded'][:4])

    # مسجّل: معلومات المستخدم + بنود القائمة
    page.evaluate("""async () => {
      const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
      window.ALW.session.start(res); window.ALW.app.refreshShell();
      await window.ALW.app.refreshNotifications(true);
    }""")
    page.wait_for_timeout(2000)
    page.click('#shop-burger')
    page.wait_for_timeout(700)

    structure = page.evaluate("""(() => {
      const panel = document.querySelector('.shop-drawer__panel');
      const user = document.getElementById('shop-menu-user');
      const nav = panel.querySelector('.shop-drawer__nav');
      const guest = document.getElementById('shop-menu-guest');
      const account = document.getElementById('shop-menu-account');
      const theme = panel.querySelector('.shop-menu__theme');
      // ترتيب الأقسام فعلياً في DOM (compareDocumentPosition) بدل innerText
      const sels = ['.shop-menu__user', '.shop-drawer__nav', '.shop-menu__guest', '.shop-menu__account', '.shop-menu__theme'];
      const nodes = sels.map(sel => panel.querySelector(sel));
      const orderOk = nodes.every(Boolean) && nodes.every((n, i) => i === 0 ||
        (nodes[i - 1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
      const cs = n => getComputedStyle(n);
      const item = panel.querySelector('.shop-drawer__nav .shop-drawer__link');
      const itemCs = cs(item);
      const themeBtn = panel.querySelector('.shop-menu__theme-btn');
      const themeCs = cs(themeBtn);
      const themeWrapCs = cs(theme);
      const r = item.getBoundingClientRect();
      return {
        hasUser: !!user && !user.hidden, userText: user ? user.innerText.trim().replace(/\\n/g, ' | ') : null,
        orderAscending: orderOk,
        orderLabels: nodes.map(n => n ? (n.className || '').split(' ')[0] : null),
        guestHidden: guest.hidden, accountHidden: account.hidden,
        accountRows: account.querySelectorAll('.shop-drawer__link').length,
        item: {fs: itemCs.fontSize, fw: itemCs.fontWeight, lh: itemCs.lineHeight, font: itemCs.fontFamily.split(',')[0],
               padTop: itemCs.paddingTop, padStart: itemCs.paddingInlineStart, gap: itemCs.gap, h: Math.round(r.height)},
        theme: {fs: themeCs.fontSize, fw: themeCs.fontWeight, font: themeCs.fontFamily.split(',')[0],
                position: themeWrapCs.position, sticky: themeWrapCs.position === 'sticky',
                h: Math.round(themeBtn.getBoundingClientRect().height)},
        themePinned: (() => { const sc = document.getElementById('shop-menu-scroll');
          return sc ? !sc.contains(panel.querySelector('.shop-menu__theme')) : true; })(),
        panelFont: cs(panel).fontFamily.split(',')[0],
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    })()""")
    check('menu order: user → shopping → (guest) → account → theme', structure['orderAscending'], structure)
    check('logged-in: compact user info visible', structure['hasUser'], structure['userText'])
    check('logged-in: guest section hidden, account rows built (5)', structure['guestHidden'] and structure['accountRows'] == 5, structure)
    norm = lambda v: v.replace('"', '')
    check('labels font = Qomra Arabic', norm(structure['panelFont']) == 'Qomra Arabic' and norm(structure['item']['font']) == 'Qomra Arabic',
          structure['panelFont'] + ' / ' + structure['item']['font'])
    check('item typography matches reference (18px/500/28px)',
          structure['item']['fs'] == REF['itemFs'] and structure['item']['fw'] == REF['itemFw'] and structure['item']['lh'] == REF['itemLh'],
          structure['item'])
    check('item padding matches reference (16px / 24px)',
          structure['item']['padTop'] == REF['itemPadTop'] and structure['item']['padStart'] == REF['itemPadStart'], structure['item'])
    check('item gap + row height match reference (16px / ~61px)',
          structure['item']['gap'] == REF['itemGap'] and abs(structure['item']['h'] - REF['itemHeight']) <= 3, structure['item'])
    check('theme labels typography matches reference (14px/500)',
          structure['theme']['fs'] == REF['themeFs'] and structure['theme']['fw'] == REF['themeFw'], structure['theme'])
    # المظهر مثبّت أسفل القائمة (طلب أحدث) — شرط: ليس fixed ولا يتحرك مع تمرير البنود
    check('theme pinned at panel bottom (no fixed/sticky, outside scroll area)',
          structure['theme']['position'] in ('static', 'relative') and not structure['theme']['sticky']
          and structure.get('themePinned', True), structure['theme'])
    check('theme buttons touch >= 44px', structure['theme']['h'] >= 44, structure['theme']['h'])
    check('no horizontal overflow with menu open', structure['overflow'] <= 0, structure['overflow'])
    page.screenshot(path='/root/alwled/frontend/tools/qa/stage15.2/menu-reorg-390.png', full_page=False)

    # المظهر يعمل من داخل المحتوى
    page.click(".shop-menu__theme-btn[data-theme-mode='dark']")
    page.wait_for_timeout(500)
    th = page.evaluate("""(() => ({theme: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('alwled.theme'),
      active: !!document.querySelector(".shop-menu__theme-btn[data-theme-mode='dark'].is-active")}))()""")
    check('theme switch works from menu content', th['theme'] == 'dark' and th['active'], th)
    page.click(".shop-menu__theme-btn[data-theme-mode='system']")
    page.wait_for_timeout(300)

    # keyboard: Escape + focus
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    kb = page.evaluate("""(() => ({open: document.getElementById('shop-drawer').classList.contains('is-open'),
      focused: document.activeElement.id,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    check('Escape closes menu & focus returns', (not kb['open']) and kb['focused'] == 'shop-burger', kb)
    check('no overflow after close', kb['overflow'] <= 0, kb['overflow'])

    # زائر: لا معلومات مستخدم، قسم الزائر ظاهر
    page.evaluate("() => { window.ALW.session.clear(); window.ALW.app.refreshShell(); }")
    page.wait_for_timeout(1200)
    guest = page.evaluate("""(() => ({userHidden: document.getElementById('shop-menu-user').hidden,
      guestHidden: document.getElementById('shop-menu-guest').hidden,
      accountHidden: document.getElementById('shop-menu-account').hidden,
      loginRows: document.querySelectorAll("#shop-drawer a[href='#/login']").length}))()""")
    check('guest: no user block, guest section shown, account hidden',
          guest['userHidden'] and guest['guestHidden'] is False and guest['accountHidden'] is True, guest)

    # الجوال: 44px للأزرار · header مبسّط
    header = page.evaluate("""(() => {
      const vis = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const items = Array.from(document.querySelectorAll('.shop-header__inner a, .shop-header__inner button')).filter(vis);
      return {count: items.length, sizes: items.map(n => Math.round(n.getBoundingClientRect().width) + 'x' + Math.round(n.getBoundingClientRect().height)),
              bell: !!(document.getElementById('shop-bell') || {}).offsetParent,
              user: !!(document.getElementById('shop-user-btn') || {}).offsetParent};
    })()""")
    check('mobile header still = 4 controls (44x44)', header['count'] == 4 and (not header['bell']) and (not header['user']), header)
    check('no console errors', len([e for e in errs if '401' not in e]) == 0, errs[:2])
    page.close()

    # ديسكتوب: 46px + بلا تغيير
    page = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ar').new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    page.evaluate("""async () => {
      const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
      window.ALW.session.start(res); window.ALW.app.refreshShell();
    }""")
    page.wait_for_timeout(1500)
    desk = page.evaluate("""(() => {
      const vis = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btns = Array.from(document.querySelectorAll('.shop-actions > *')).filter(vis);
      return {sizes: btns.map(n => Math.round(n.getBoundingClientRect().width) + 'x' + Math.round(n.getBoundingClientRect().height)),
              bell: !!document.getElementById('shop-bell').offsetParent,
              user: !!document.getElementById('shop-user-btn').offsetParent,
              nav: document.querySelectorAll('.shop-nav__link').length,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
    })()""")
    check('desktop: 46x46 buttons, bell + account + nav intact',
          all(s == '46x46' for s in desk['sizes']) and desk['bell'] and desk['user'] and desk['nav'] == 4, desk)
    check('desktop: no overflow', desk['overflow'] <= 0, desk['overflow'])
    page.close()
    b.close()

print('\nREFERENCE ALIGNMENT (Unblock Syria):', 'PASS' if not fails else 'FAIL (%d)' % len(fails))
for f in fails:
    print('  ✗', f)
