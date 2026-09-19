"""فحص رحلة الشراء بعد التحسين: بطاقة قابلة للنقر · فلاتر الجوال · CTA لاصق في السلة."""
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

    # --- جوال ---
    page = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2).new_page()
    errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.goto(SHOP + '#/products', wait_until='load')
    page.wait_for_timeout(2200)

    filters = page.evaluate("""(() => {
      const t = document.getElementById('shop-filters-toggle');
      const tb = document.getElementById('shop-toolbar');
      const search = document.getElementById('shop-filter-search');
      const fields = Array.from(document.querySelectorAll('.shop-toolbar__field--filter'))
        .map(f => ({visible: !!f.offsetParent, h: Math.round(f.getBoundingClientRect().height)}));
      const sr = search ? search.getBoundingClientRect() : null;
      return {toggle: t ? Math.round(t.getBoundingClientRect().height) : 0,
              expanded: t ? t.getAttribute('aria-expanded') : null,
              toolbarH: Math.round(tb.getBoundingClientRect().height),
              searchVisible: !!search.offsetParent, searchH: sr ? Math.round(sr.height) : 0,
              filterFields: fields,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
    })()""")
    check('mobile: filters toggle visible (44px)', filters['toggle'] >= 44, filters['toggle'])
    check('mobile: search field stays visible', filters['searchVisible'] and filters['searchH'] >= 44, filters)
    check('mobile: filter fields collapsed by default', all(not f['visible'] for f in filters['filterFields']), filters['filterFields'])
    # قبل التحسين كان الشريط يحمل 4 حقول (~330px)؛ الآن حقل البحث + العدّاد فقط
    check('mobile: toolbar compact (search+count only)', filters['toolbarH'] <= 140, filters['toolbarH'])
    check('mobile: no overflow', filters['overflow'] <= 0, filters['overflow'])

    page.click('#shop-filters-toggle')
    page.wait_for_timeout(400)
    opened = page.evaluate("""(() => ({
      expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded'),
      visible: Array.from(document.querySelectorAll('.shop-toolbar__field--filter')).every(f => !!f.offsetParent),
      height: Math.round(document.getElementById('shop-toolbar').getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    check('mobile: filters expand on tap', opened['expanded'] == 'true' and opened['visible'], opened)
    check('mobile: no overflow when expanded', opened['overflow'] <= 0, opened['overflow'])

    # الفلترة تعمل فعلاً بعد الفتح
    page.select_option('#shop-filter-sort', 'price:asc')
    page.wait_for_timeout(1800)
    sorted_state = page.evaluate("""(() => ({hash: location.hash,
      expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded'),
      count: document.querySelectorAll('.shop-card').length}))()""")
    check('mobile: sorting still works (hash updated)', 'sortBy=price' in sorted_state['hash'] or 'sortOrder=asc' in sorted_state['hash'], sorted_state)

    # البطاقة قابلة للنقر بالكامل
    page.goto(SHOP + '#/products', wait_until='load')
    page.wait_for_timeout(2000)
    card = page.evaluate("""(() => {
      const c = document.querySelector('.shop-card');
      const r = c.getBoundingClientRect();
      const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height - 12);
      const a = target && target.closest ? target.closest('a') : null;
      return {hit: !!a, href: a ? a.getAttribute('href') : null};
    })()""")
    check('card body click hits a product link (whole card tappable)', card['hit'] and card['href'].startswith('#/products/'), card)

    # السلة: ملخّص لاصق أسفل الشاشة
    page.evaluate("""async () => {
      const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
      window.ALW.session.start(res);
      await window.ALW.shopCart.load();
    }""")
    page.wait_for_timeout(1200)
    page.goto(SHOP + '#/cart', wait_until='load')
    page.wait_for_timeout(2500)
    cart = page.evaluate("""(() => {
      const aside = document.querySelector('.shop-cart__aside');
      if (!aside) return null;
      const cs = getComputedStyle(aside);
      const r = aside.getBoundingClientRect();
      const btn = aside.querySelector('.btn');
      return {position: cs.position, bottom: Math.round(r.bottom), vh: window.innerHeight,
              btnH: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
              totalVisible: !!aside.querySelector('.shop-cart__row--total'),
              otherRows: Array.from(aside.querySelectorAll('.shop-cart__row')).filter(x => !x.classList.contains('shop-cart__row--total')).filter(x => !!x.offsetParent).length,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
    })()""")
    check('cart: summary is sticky on mobile', cart and cart['position'] == 'sticky', cart)
    check('cart: total + CTA visible in sticky summary', cart and cart['totalVisible'] and cart['btnH'] >= 48, cart)
    check('cart: no overflow', cart and cart['overflow'] <= 0, cart)
    page.screenshot(path='/root/alwled/frontend/tools/qa/stage15.2/cart-sticky-390.png', full_page=False)

    check('no console errors', len([e for e in errs if '401' not in e]) == 0, errs[:2])
    page.close()

    # --- ديسكتوب: الفلاتر كلها ظاهرة بدون زر ---
    page = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ar').new_page()
    page.goto(SHOP + '#/products', wait_until='load')
    page.wait_for_timeout(2000)
    desk = page.evaluate("""(() => ({
      toggleVisible: !!document.getElementById('shop-filters-toggle').offsetParent,
      fieldsVisible: Array.from(document.querySelectorAll('.shop-toolbar__field--filter')).filter(f => !!f.offsetParent).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}))()""")
    check('desktop: no filters toggle, all filter fields visible', (not desk['toggleVisible']) and desk['fieldsVisible'] == 3, desk)
    check('desktop: no overflow', desk['overflow'] <= 0, desk['overflow'])
    page.close()
    b.close()

print('\nPURCHASE JOURNEY POLISH:', 'PASS' if not fails else 'FAIL (%d)' % len(fails))
for f in fails:
    print('  ✗', f)
