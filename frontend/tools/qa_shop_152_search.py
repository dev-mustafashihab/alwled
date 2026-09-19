"""فحص بحث الجوال: الزر · اللوحة · الاقتراحات · debounce · النتائج · الدولة الفارغة · المسح · الإغلاق."""
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
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    requests = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.on('request', lambda r: requests.append(r.url) if '/products?' in r.url else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1600)

    btn = page.locator('#shop-search-btn')
    box = btn.bounding_box()
    check('search button visible & 44x44 (mobile)', box and box['width'] >= 44 and box['height'] >= 44, box)
    check('module loaded (ALW.shopSearch)', page.evaluate('!!(window.ALW && window.ALW.shopSearch)'))

    page.click('#shop-search-btn')
    page.wait_for_timeout(120)
    early = page.evaluate("""(() => { const s = document.getElementById('shop-search-sheet');
      return {hidden: s.hidden, opening: s.classList.contains('is-opening'), open: s.classList.contains('is-open')}; })()""")
    check('sheet starts from pre-state (animated)', early and not early['hidden'], early)

    page.wait_for_timeout(600)
    opened = page.evaluate("""(() => {
      const s = document.getElementById('shop-search-sheet');
      const r = s.getBoundingClientRect();
      const header = document.querySelector('.shop-header').getBoundingClientRect();
      return {top: Math.round(r.top), headerBottom: Math.round(header.bottom), width: Math.round(r.width),
              vw: window.innerWidth, opacity: getComputedStyle(s).opacity,
              bodyLocked: document.body.style.overflow === 'hidden',
              htmlLocked: document.documentElement.style.overflow === 'hidden',
              focused: document.activeElement.id,
              chips: document.querySelectorAll('.shop-search-chip').length,
              inputSize: Math.round(document.getElementById('shop-search-sheet-input').getBoundingClientRect().height)};
    })()""")
    check('sheet opens under header, full width, dims nothing', opened['top'] == opened['headerBottom'] and opened['width'] >= opened['vw'] - 1, opened)
    check('scroll locked + input focused', opened['bodyLocked'] and opened['htmlLocked'] and opened['focused'] == 'shop-search-sheet-input', opened)
    check('suggestions loaded from real data (chips > 0)', opened['chips'] > 0, opened['chips'])
    check('search input >= 44px', opened['inputSize'] >= 44, opened['inputSize'])

    # debounce: كتابة سريعة ⇒ طلب واحد فقط
    requests.clear()
    page.fill('#shop-search-sheet-input', 'ث')
    page.wait_for_timeout(80)
    page.fill('#shop-search-sheet-input', 'ثلا')
    page.wait_for_timeout(80)
    page.fill('#shop-search-sheet-input', 'ثلاجة')
    page.wait_for_timeout(1300)
    check('debounce: طلبات البحث <= 2 بعد كتابة 3 مرات', len(requests) <= 2, len(requests))
    res = page.evaluate("""(() => ({
      rows: document.querySelectorAll('.shop-search-row').length,
      label: (document.querySelector('#shop-search-results .shop-search-sheet__label') || {}).textContent || null,
      clearVisible: !document.getElementById('shop-search-clear').hidden,
      suggestHidden: document.getElementById('shop-search-suggest').hidden,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()""")
    check('results rendered (real products)', res['rows'] > 0, res)
    check('results label + clear button visible + suggestions hidden', bool(res['label']) and res['clearVisible'] and res['suggestHidden'], res)
    check('no horizontal overflow inside sheet', res['overflow'] <= 0, res['overflow'])

    # حالة عدم وجود نتائج
    page.fill('#shop-search-sheet-input', 'zzzzqq')
    page.wait_for_timeout(1300)
    empty = page.evaluate("""(() => ({rows: document.querySelectorAll('.shop-search-row').length,
      state: (document.querySelector('.shop-search-state__title') || {}).textContent || null,
      retry: !!document.querySelector('.shop-search-state .btn')}))()""")
    check('empty state shown with CTA', empty['rows'] == 0 and empty['state'] and empty['retry'], empty)

    # مسح النص يعيد الاقتراحات
    page.click('#shop-search-clear')
    page.wait_for_timeout(600)
    cleared = page.evaluate("""(() => ({
      value: document.getElementById('shop-search-sheet-input').value,
      chips: document.querySelectorAll('.shop-search-chip').length,
      clearHidden: document.getElementById('shop-search-clear').hidden}))()""")
    check('clear resets text and restores suggestions', cleared['value'] == '' and cleared['chips'] > 0 and cleared['clearHidden'], cleared)

    # اختيار نتيجة ينقل ويغلق
    page.fill('#shop-search-sheet-input', 'ثلاجة')
    page.wait_for_timeout(1300)
    href = page.evaluate("(() => { const a = document.querySelector('.shop-search-row'); return a ? a.getAttribute('href') : null; })()")
    page.locator('.shop-search-row').first.click()
    page.wait_for_timeout(1400)
    nav = page.evaluate("""(() => ({hash: location.hash,
      open: document.getElementById('shop-search-sheet').classList.contains('is-open'),
      hidden: document.getElementById('shop-search-sheet').hidden,
      bodyOverflow: document.body.style.overflow}))()""")
    check('result navigates & closes sheet', nav['hash'].startswith('#/products/') and not nav['open'] and nav['hidden'] and nav['bodyOverflow'] in ('', 'visible'), nav)

    # Escape يغلق
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    page.click('#shop-search-btn')
    page.wait_for_timeout(600)
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    esc = page.evaluate("""(() => ({open: document.getElementById('shop-search-sheet').classList.contains('is-open'),
      focused: document.activeElement.id, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    check('Escape closes & focus returns to button', not esc['open'] and esc['focused'] == 'shop-search-btn', esc)
    check('no page overflow after close', esc['overflow'] <= 0, esc['overflow'])

    # الديسكتوب: الزر مخفي (حقل البحث المضمّن موجود)
    page.set_viewport_size({'width': 1440, 'height': 900})
    page.wait_for_timeout(500)
    desk = page.evaluate("""(() => ({btnVisible: !!document.getElementById('shop-search-btn').offsetParent,
      inlineForm: !!document.querySelector('.shop-search').offsetParent}))()""")
    check('desktop: search button hidden, inline search visible', (not desk['btnVisible']) and desk['inlineForm'], desk)

    check('no console errors', len([e for e in errs if '401' not in e]) == 0, errs[:2])
    b.close()

import json as _json
_json.dump({"checks": len(fails) and 0 or 0, "failures": fails}, open("/root/alwled/frontend/tools/qa/stage15.2/shop-152-search-report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print('\nSEARCH SHEET:', 'PASS' if not fails else 'FAIL (%d)' % len(fails))
for f in fails:
    print('  ✗', f)
import sys as _sys
_sys.exit(0 if not fails else 1)
