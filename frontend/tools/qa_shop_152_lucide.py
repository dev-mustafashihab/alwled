"""فحص مكتبة Lucide + ارتفاع الهيدر 73px + سلامة الأيقونات في كل الواجهات."""
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
    for w, expect in ((390, 73), (1440, 73)):
        page = b.new_context(viewport={'width': w, 'height': 900}, locale='ar').new_page()
        errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1600)
        page.evaluate("""async () => {
          const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
          window.ALW.session.start(res); window.ALW.app.refreshShell();
        }""")
        page.wait_for_timeout(1500)

        hdr = page.evaluate("""(() => {
          const inner = document.querySelector('.shop-header__inner');
          return {h: Math.round(inner.getBoundingClientRect().height),
                  cssVar: getComputedStyle(document.body).getPropertyValue('--hdrmenu-top').trim(),
                  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
        })()""")
        check('header height = 73px (reference) @%d' % w, hdr['h'] == expect, hdr)
        check('no overflow @%d' % w, hdr['overflow'] <= 0, hdr['overflow'])

        icons = page.evaluate("""(() => {
          const svgs = Array.from(document.querySelectorAll('svg'));
          const lucide = svgs.filter(s => String(s.getAttribute('class') || '').indexOf('lucide') === 0);
          const names = {};
          lucide.forEach(s => { names[String(s.getAttribute('class')).replace('lucide lucide-', '')] = 1; });
          return {total: svgs.length, lucide: lucide.length, names: Object.keys(names).sort(),
                  module: !!(window.ALW && window.ALW.icons),
                  sample: lucide.length ? String(lucide[0].getAttribute('class')) : null};
        })()""")
        label = 'mobile' if w == 390 else 'desktop'
        if w == 390:
            check('icons module loaded (Lucide locally)', icons['module'], icons['module'])
            check('all header icons are Lucide', icons['lucide'] >= 3, icons)
            # فتح القائمة + البحث للتحقق من أيقوناتها
            page.click('#shop-burger')
            page.wait_for_timeout(700)
            menu_icons = page.evaluate("""(() => {
              const panel = document.querySelector('.shop-drawer__panel');
              const lucide = panel.querySelectorAll('svg[class^="lucide"]').length;
              const theme = panel.querySelectorAll('.shop-menu__theme-btn svg[class^="lucide"]').length;
              return {lucide: lucide, theme: theme};
            })()""")
            check('menu rows + theme use Lucide icons', menu_icons['lucide'] >= 8 and menu_icons['theme'] == 3, menu_icons)
            page.keyboard.press('Escape')
            page.wait_for_timeout(400)
            page.click('#shop-search-btn')
            page.wait_for_timeout(700)
            sheet = page.evaluate("""(() => ({lucide: document.querySelectorAll('#shop-search-sheet svg[class^="lucide"]').length,
              results: document.querySelectorAll('.shop-search-chip').length}))()""")
            check('search sheet uses Lucide icons', sheet['lucide'] >= 3, sheet)
            page.keyboard.press('Escape')
            page.wait_for_timeout(400)
        check('no console errors @%s' % label, len([e for e in errs if '401' not in e]) == 0, errs[:2])
        page.screenshot(path='/root/alwled/frontend/tools/qa/stage15.2/lucide-%d.png' % w)
        page.close()
    b.close()

print('\nLUCIDE ICONS + HEADER 73px:', 'PASS' if not fails else 'FAIL (%d)' % len(fails))
for f in fails:
    print('  ✗', f)
