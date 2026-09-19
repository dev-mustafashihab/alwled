"""فحص: تثبيت المظهر + تمرير سلس + فواصل مستقيمة + المؤشر المنزلق + بلا أثر ضغط."""
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
    page = b.new_context(viewport={'width': 390, 'height': 700}, locale='ar', device_scale_factor=2).new_page()
    errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    page.evaluate("""async () => {
      const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
      window.ALW.session.start(res); window.ALW.app.refreshShell();
    }""")
    page.wait_for_timeout(1500)
    page.click('#shop-burger')
    page.wait_for_timeout(800)

    state = page.evaluate("""(() => {
      const panel = document.querySelector('.shop-drawer__panel');
      const scroll = document.getElementById('shop-menu-scroll');
      const theme = panel.querySelector('.shop-menu__theme');
      const thumb = panel.querySelector('.shop-menu__theme-thumb');
      const rows = Array.from(panel.querySelectorAll('.shop-drawer__link'));
      const cs = n => getComputedStyle(n);
      const pr = panel.getBoundingClientRect();
      const tr = theme.getBoundingClientRect();
      const sr = scroll.getBoundingClientRect();
      return {
        hasScrollArea: !!scroll,
        scrollOverflowY: scroll ? cs(scroll).overflowY : null,
        scrollBehavior: scroll ? cs(scroll).scrollBehavior : null,
        scrollable: scroll ? (scroll.scrollHeight > scroll.clientHeight + 4) : false,
        themeBottomAligned: Math.abs(pr.bottom - tr.bottom) <= 90,   // المظهر قريب من أسفل اللوحة
        themeInsideScroll: scroll ? scroll.contains(theme) : null,
        thumb: thumb ? {w: Math.round(thumb.getBoundingClientRect().width), x: Math.round(thumb.getBoundingClientRect().left)} : null,
        borders: rows.slice(0, 5).map(r => cs(r).borderBottomWidth + ' ' + cs(r).borderBottomStyle),
        btnActiveBg: cs(panel.querySelector(".shop-menu__theme-btn[data-theme-mode='system']")).backgroundColor,
        activeIsSystem: !!panel.querySelector(".shop-menu__theme-btn[data-theme-mode='system'].is-active"),
        themePos: cs(theme).position,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    })()""")
    check('menu has a scrollable area (smooth)', state['hasScrollArea'] and state['scrollOverflowY'] == 'auto'
          and state['scrollBehavior'] == 'smooth', state)
    check('theme pinned at panel bottom (not inside scroll area)',
          state['themeInsideScroll'] is False and state['themePos'] in ('static', 'relative'), state)
    check('straight divider between every item (1px solid)',
          all(b.startswith('1px solid') for b in state['borders']), state['borders'])
    check('sliding thumb present and sized to the active button', state['thumb'] and state['thumb']['w'] > 60, state['thumb'])
    check('theme buttons have no pressed/active background',
          state['btnActiveBg'] in ('rgba(0, 0, 0, 0)', 'transparent'), state['btnActiveBg'])

    # المؤشر ينزلق عند اختيار «داكن»
    before = page.evaluate("() => { const t = document.querySelector('.shop-menu__theme-thumb'); return Math.round(t.getBoundingClientRect().left); }")
    page.click(".shop-menu__theme-btn[data-theme-mode='dark']")
    page.wait_for_timeout(90)
    mid = page.evaluate("""(() => { const t = document.querySelector('.shop-menu__theme-thumb');
      return {left: Math.round(t.getBoundingClientRect().left), transition: getComputedStyle(t).transitionProperty}; })()""")
    page.wait_for_timeout(420)
    after = page.evaluate("""(() => { const t = document.querySelector('.shop-menu__theme-thumb');
      const b = document.querySelector(".shop-menu__theme-btn[data-theme-mode='dark']");
      return {left: Math.round(t.getBoundingClientRect().left), btnLeft: Math.round(b.getBoundingClientRect().left),
              theme: document.documentElement.getAttribute('data-theme')}; })()""")
    check('thumb slides to the chosen button (lands on it)', abs(after['left'] - after['btnLeft']) <= 6, after)
    check('thumb moved (not stuck)', after['left'] != before, 'before=%s after=%s' % (before, after['left']))
    check('thumb transition animated (transform)', 'transform' in (mid['transition'] or ''), mid['transition'])
    check('theme actually switched', after['theme'] == 'dark', after)

    # بلا أثر ضغط على الزر نفسه
    pressed = page.evaluate("""(() => {
      const btn = document.querySelector(".shop-menu__theme-btn[data-theme-mode='light']");
      const before = getComputedStyle(btn).backgroundColor;
      btn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
      const during = getComputedStyle(btn).backgroundColor;
      return {before: before, during: during, tap: getComputedStyle(btn).webkitTapHighlightColor};
    })()""")
    check('no visible pressed state on theme button',
          pressed['before'] == pressed['during'] and pressed['before'] in ('rgba(0, 0, 0, 0)', 'transparent'), pressed)

    # المظهر ثابت عند تمرير البنود
    scroll_test = page.evaluate("""(async () => {
      const scroll = document.getElementById('shop-menu-scroll');
      const theme = document.querySelector('.shop-menu__theme');
      const beforeTop = Math.round(theme.getBoundingClientRect().top);
      scroll.scrollTop = 0; scroll.scrollTop = 400;
      await new Promise(r => setTimeout(r, 200));
      const afterTop = Math.round(theme.getBoundingClientRect().top);
      return {beforeTop: beforeTop, afterTop: afterTop, scrolled: scroll.scrollTop, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
    })()""")
    check('theme stays pinned while list scrolls', abs(scroll_test['beforeTop'] - scroll_test['afterTop']) <= 4, scroll_test)
    check('no horizontal overflow', scroll_test['overflow'] <= 0, scroll_test['overflow'])
    page.screenshot(path='/root/alwled/frontend/tools/qa/stage15.2/menu-theme-pinned-390.png')

    page.keyboard.press('Escape')
    page.wait_for_timeout(400)
    check('Escape still closes + no console errors',
          page.evaluate("!document.getElementById('shop-drawer').classList.contains('is-open')")
          and len([e for e in errs if '401' not in e]) == 0, errs[:2])
    b.close()

print('\nTHEME PIN + SLIDE + DIVIDERS:', 'PASS' if not fails else 'FAIL (%d)' % len(fails))
for f in fails:
    print('  ✗', f)
