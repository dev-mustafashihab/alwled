"""PHASE 3 · STEP 3A — متابعة (قراءة فقط): رحلة الفلاتر على الجوال · الإغلاق · التركيز · Add-to-cart · غياب أدوات الديسكتوب.

الاستخدام: python3 audit_followup.py
"""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3a'
os.makedirs(OUT, exist_ok=True)
R = {'console': [], 'net': {}, 'shots': []}

SNAP = """(() => ({hash: location.hash, count: (document.querySelector('.shop-toolbar__count')||{}).textContent,
  cards: document.querySelectorAll('.shop-card').length,
  names: Array.from(document.querySelectorAll('.shop-card__name')).map(n => (n.textContent||'').trim()),
  prices: Array.from(document.querySelectorAll('.shop-price__now')).map(n => (n.textContent||'').trim()),
  first: (document.querySelector('.shop-card__name')||{}).textContent,
  sheetOpen: !!document.querySelector('.shop-filters.is-open'),
  toggleExpanded: (document.getElementById('shop-filters-toggle')||{}).getAttribute && document.getElementById('shop-filters-toggle').getAttribute('aria-expanded'),
  empty: !!document.querySelector('.state--empty'), stateTitle: (document.querySelector('.state__title')||{}).textContent,
  active: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null,
  bodyOverflow: getComputedStyle(document.body).overflowY,
  docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  headClearBtn: Array.from(document.querySelectorAll('.shop-section__head .btn')).map(b => (b.textContent||'').trim()),
  scrollY: Math.round(window.scrollY)}))()"""


def shoot(page, name):
    p = os.path.join(OUT, name + '.png')
    page.screenshot(path=p)
    R['shots'].append(p)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- A) رحلة الفلاتر على الجوال 390 ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'type': m.type, 'text': m.text[:160]}) if m.type == 'error' else None)
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    J = R.setdefault('journey', {})

    def snap(label):
        d = page.evaluate(SNAP)
        d['net'] = list(reqs); reqs.clear()
        J[label] = d
        print('%-22s %s' % (label, {k: d[k] for k in ('hash', 'cards', 'first', 'sheetOpen', 'empty')}))
        return d

    snap('01_start')
    # فتح اللوحة
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(600)
    snap('02_sheet_open')
    shoot(page, 'filters-390-open-followup')
    # التركيز بعد الفتح
    J['02_sheet_open']['focusAfterOpen'] = page.evaluate("document.activeElement ? (document.activeElement.id || document.activeElement.className) : null")
    # اختيار تصنيف
    page.select_option('#shop-filter-category', '293')
    page.wait_for_timeout(1900)
    snap('03_category_293')
    # فتح + إضافة علامة
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(500)
    page.select_option('#shop-filter-brand', '254')
    page.wait_for_timeout(1900)
    snap('04_plus_brand_254')
    # ترتيب
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(500)
    page.select_option('#shop-filter-sort', 'price:asc')
    page.wait_for_timeout(1900)
    snap('05_sort_price_asc')
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(500)
    page.select_option('#shop-filter-sort', 'price:desc')
    page.wait_for_timeout(1900)
    snap('06_sort_price_desc')
    # سعر + توفر + عروض
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(500)
    page.fill('#shop-filter-minprice', '400')
    page.dispatch_event('#shop-filter-minprice', 'change')
    page.wait_for_timeout(1900)
    snap('07_minprice_400')
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(500)
    page.check('#shop-filter-instock')
    page.wait_for_timeout(1900)
    snap('08_instock')
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(500)
    page.check('#shop-filter-offers')
    page.wait_for_timeout(1900)
    snap('09_offers')
    # إزالة فلتر واحد
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(500)
    page.select_option('#shop-filter-brand', '')
    page.wait_for_timeout(1900)
    snap('10_remove_brand')
    # إعادة تحميل
    page.reload(wait_until='load')
    page.wait_for_timeout(2400)
    snap('11_after_reload')
    page.go_back()
    page.wait_for_timeout(2000)
    snap('12_after_back')
    page.go_forward()
    page.wait_for_timeout(2000)
    snap('13_after_forward')
    # تفريغ الكل من الرأس إن ظهر
    page.evaluate("""(() => { const b = document.querySelector('.shop-section__head .btn'); if (b) b.click(); })()""")
    page.wait_for_timeout(2000)
    snap('14_reset_head')
    # تفريغ من داخل اللوحة
    page.evaluate('location.hash = "#/products?categoryId=293"')
    page.wait_for_timeout(1900)
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(600)
    page.click('.shop-filters__clear')
    page.wait_for_timeout(2000)
    snap('15_reset_sheet')
    ctx.close()

    # ---------- B) الإغلاق: Escape · scrim (أعلى الشاشة) · زر الإغلاق ----------
    for label, action in [('escape', 'escape'), ('scrim_top', 'scrim'), ('close_btn', 'close')]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1800)
        page.click('#shop-filters-toggle')
        page.wait_for_timeout(600)
        before = page.evaluate("({open: !!document.querySelector('.shop-filters.is-open'), focus: document.activeElement ? (document.activeElement.id||document.activeElement.className) : null, bodyOv: getComputedStyle(document.body).overflowY})")
        if action == 'escape':
            page.keyboard.press('Escape')
        elif action == 'scrim':
            page.mouse.click(195, 30)          # أعلى الشاشة فوق اللوحة
        else:
            page.click('.shop-filters__sheet-close')
        page.wait_for_timeout(700)
        after = page.evaluate("({open: !!document.querySelector('.shop-filters.is-open'), focus: document.activeElement ? (document.activeElement.id||document.activeElement.className) : null, bodyOv: getComputedStyle(document.body).overflowY})")
        R['close_' + label] = {'before': before, 'after': after}
        print('close %-10s before=%s after=%s' % (label, before, after))
        ctx.close()

    # ---------- C) Add to cart (زائر) ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append((r.method, r.url.split('/api/v1/')[-1])) if '/api/v1/' in r.url else None)
    page.on('console', lambda m: R['console'].append({'type': m.type, 'text': m.text[:160]}) if m.type == 'error' else None)
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    reqs.clear()
    before = page.evaluate("""({hash: location.hash, badge: (document.getElementById('shop-cart-count')||document.getElementById('shop-cart-badge')||{}).textContent,
      btnText: (document.querySelector('.shop-card__add')||{}).textContent, btnDisabled: document.querySelector('.shop-card__add') && document.querySelector('.shop-card__add').hasAttribute('disabled')})""")
    page.click('.shop-card__add')
    page.wait_for_timeout(1500)
    after = page.evaluate("""(() => { const dialogs = Array.from(document.querySelectorAll('[role=dialog], .shop-modal, .shop-auth, [class*=auth-prompt]'));
      const vis = dialogs.filter(d => d.offsetParent !== null || getComputedStyle(d).display !== 'none');
      return {hash: location.hash,
        visibleDialogs: vis.map(d => ({cls: d.className, text: (d.textContent||'').trim().replace(/\\s+/g,' ').slice(0, 90)})),
        allDialogCls: dialogs.map(d => d.className),
        badge: (document.getElementById('shop-cart-count')||document.getElementById('shop-cart-badge')||{}).textContent,
        bodyOv: getComputedStyle(document.body).overflowY,
        loginVisible: !!document.querySelector('#shop-view form'),
        h1: (document.querySelector('#shop-view h1')||{}).textContent}; })()""")
    R['addtocart'] = {'before': before, 'after': after, 'net': list(reqs)}
    shoot(page, 'addtocart-guest-1366')
    print('addtocart: before=%s' % before)
    print('addtocart: after=%s' % after)
    print('addtocart net:', R['addtocart']['net'])
    ctx.close()

    # ---------- D) ما هو مرئي فعلاً في صفحة المنتجات: جوال مقابل ديسكتوب ----------
    for w in (390, 1024, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1800)
        R['visible_%d' % w] = page.evaluate("""(() => { const vis = el => { const b = el.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'; };
          const items = Array.from(document.querySelectorAll('#shop-view > *, #shop-view .shop-toolbar, #shop-view .shop-filters, #shop-view .shop-filters__toggle, #shop-view .shop-filters__sheet, #shop-view .shop-toolbar__count'));
          return items.map(el => { const b = el.getBoundingClientRect();
            return {cls: el.className, tag: el.tagName, visible: vis(el), w: Math.round(b.width), h: Math.round(b.height),
              display: getComputedStyle(el).display}; }); })()""")
        print('visible @%d:' % w, [(x['tag'], x['cls'][:26], x['visible']) for x in R['visible_%d' % w]])
        ctx.close()
    b.close()

with open(os.path.join(OUT, 'audit-followup.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nreport:', os.path.join(OUT, 'audit-followup.json'), '| console:', len(R['console']))
