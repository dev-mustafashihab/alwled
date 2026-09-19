"""PHASE 3 · STEP 3G — لقطات + أسماء العناصر + تصادم الطبقات (بعد)."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3g/shots'
os.makedirs(OUT, exist_ok=True)
R = {'names': [], 'collisions': {}, 'shots': []}


def shot(page, name):
    p = os.path.join(OUT, name + '.png')
    page.screenshot(path=p)
    R['shots'].append(p)


def products(page, wait=1900):
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(wait)


NAMES_JS = r"""(() => {
  const name = el => {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = document.getElementById(lb); if (t) return (t.textContent || '').trim(); }
    if (el.id) { const l = document.querySelector('label[for="' + el.id + '"]'); if (l) return (l.textContent || '').trim(); }
    const w = el.closest('label'); if (w) return (w.textContent || '').trim();
    const txt = (el.textContent || '').trim(); if (txt) return txt.slice(0, 30);
    const img = el.querySelector('img[alt]'); if (img && img.getAttribute('alt')) return 'img:' + img.getAttribute('alt');
    const svg = el.querySelector('svg title'); if (svg) return 'svg:' + svg.textContent.trim();
    return null;
  };
  return Array.from(document.querySelectorAll('a[href], button')).map(el => {
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden') return null;
    return {tag: el.tagName, cls: String(el.className).slice(0, 34), id: el.id, name: name(el), text: (el.textContent || '').trim().slice(0, 18)};
  }).filter(Boolean);
})()"""

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ============ لقطات صفحة المنتجات ============
    for w, theme, label in [(360, 'light', 'products-360-light'), (390, 'light', 'products-390-light'), (390, 'dark', 'products-390-dark'),
                            (768, 'light', 'products-768-light'), (769, 'light', 'products-769-light'), (1024, 'light', 'products-1024-light'),
                            (1024, 'dark', 'products-1024-dark'), (1366, 'light', 'products-1366-light'), (1366, 'dark', 'products-1366-dark'),
                            (1920, 'light', 'products-1920-light')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1500)
        products(page)
        shot(page, label)
        ctx.close()

    # ============ لقطات اللوحة المفتوحة ============
    for w, theme, label in [(360, 'light', 'filters-360-light'), (390, 'light', 'filters-390-light'),
                            (390, 'dark', 'filters-390-dark'), (768, 'light', 'filters-768-light')]:
        ctx = b.new_context(viewport={'width': w, 'height': 844}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1500)
        products(page)
        page.evaluate("document.getElementById('shop-filters-toggle').click()")
        page.wait_for_timeout(800)
        shot(page, label)
        ctx.close()

    # ============ لقطات التركيز ============
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    products(page)
    page.evaluate("document.getElementById('shop-filters-toggle').focus()")
    page.wait_for_timeout(300)
    shot(page, 'focus-390-opener')
    page.evaluate("document.getElementById('shop-filters-toggle').click()")
    page.wait_for_timeout(800)
    page.evaluate("document.querySelector('.shop-filters__sheet-close').focus()")
    page.wait_for_timeout(300)
    shot(page, 'focus-390-close')
    page.evaluate("document.getElementById('shop-filter-offers').focus()")
    page.wait_for_timeout(300)
    shot(page, 'focus-390-checkbox')
    page.keyboard.press('Escape')
    page.wait_for_timeout(700)
    page.evaluate("document.querySelector('.shop-card__add').focus()")
    page.wait_for_timeout(300)
    shot(page, 'focus-390-add')
    page.evaluate("document.querySelector('.shop-card__media').focus()")
    page.wait_for_timeout(300)
    shot(page, 'focus-390-cardlink')
    R['names'] = page.evaluate(NAMES_JS)
    # تصادم الطبقات: فلاتر → قائمة / فلاتر → بحث
    def st():
        return page.evaluate("""(() => ({menu: !!document.querySelector('.shop-drawer.is-open'), search: !!document.querySelector('.shop-search-sheet.is-open'),
          filters: !!document.querySelector('.shop-filters.is-open'), body: getComputedStyle(document.body).overflowY,
          expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded'),
          focus: document.activeElement ? (document.activeElement.id || String(document.activeElement.className).slice(0, 30)) : null}))()""")
    page.evaluate("document.getElementById('shop-filters-toggle').click()")
    page.wait_for_timeout(700)
    page.keyboard.press('Escape')
    page.wait_for_timeout(700)
    page.click('#shop-burger')
    page.wait_for_timeout(800)
    R['collisions']['filters_then_menu_open'] = st()
    page.keyboard.press('Escape')
    page.wait_for_timeout(800)
    R['collisions']['filters_then_menu_closed'] = st()
    page.evaluate("document.getElementById('shop-filters-toggle').click()")
    page.wait_for_timeout(700)
    page.keyboard.press('Escape')
    page.wait_for_timeout(700)
    page.click('#shop-search-btn')
    page.wait_for_timeout(900)
    R['collisions']['filters_then_search_open'] = st()
    page.keyboard.press('Escape')
    page.wait_for_timeout(800)
    R['collisions']['filters_then_search_closed'] = st()
    # مسار التصنيفات/العلامات + التركيز عليها
    page.evaluate('location.hash = "#/products?view=categories"')
    page.wait_for_timeout(1900)
    page.evaluate("document.querySelector('#shop-view > .shop-taxonomy > .shop-taxonomy__item').focus()")
    page.wait_for_timeout(300)
    shot(page, 'focus-390-taxonomy')
    ctx.close()

    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    products(page)
    page.evaluate("document.querySelector('.shop-card__media').focus()")
    page.wait_for_timeout(300)
    shot(page, 'focus-1366-cardlink')
    page.evaluate('location.hash = "#/products?view=categories"')
    page.wait_for_timeout(1900)
    page.evaluate("document.querySelector('#shop-view > .shop-taxonomy > .shop-taxonomy__item').focus()")
    page.wait_for_timeout(300)
    shot(page, 'focus-1366-taxonomy')
    # خطأ + تركيز زر إعادة المحاولة
    page.route('**/products?*', lambda r: r.abort())
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(2200)
    page.evaluate("(() => { const b=document.querySelector('#shop-view .state .btn'); if (b) b.focus(); })()")
    page.wait_for_timeout(300)
    shot(page, 'focus-1366-retry')
    ctx.close()

    # ============ لقطات الانحدار ============
    for w, theme, label, hash in [(390, 'light', 'reg-home-390', '#/'), (1366, 'light', 'reg-home-1366', '#/'),
                                  (390, 'light', 'reg-categories-390', '#/products?view=categories'),
                                  (1366, 'light', 'reg-categories-1366', '#/products?view=categories'),
                                  (390, 'light', 'reg-brands-390', '#/products?view=brands'),
                                  (1366, 'light', 'reg-brands-1366', '#/products?view=brands'),
                                  (1366, 'dark', 'reg-empty-dark', '#/products?minPrice=99999')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1500)
        page.evaluate('location.hash = "%s"' % hash)
        page.wait_for_timeout(2000)
        shot(page, label)
        ctx.close()

    # قائمة + بحث (390)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    page.click('#shop-burger')
    page.wait_for_timeout(800)
    shot(page, 'reg-menu-390')
    page.keyboard.press('Escape')
    page.wait_for_timeout(700)
    page.click('#shop-search-btn')
    page.wait_for_timeout(800)
    page.fill('#shop-search-sheet-input', 'ثلاجة')
    page.wait_for_timeout(1500)
    shot(page, 'reg-search-390')
    ctx.close()

    # خطأ داكن 1366
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    page.route('**/products?*', lambda r: r.abort())
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(2200)
    shot(page, 'reg-error-dark')
    ctx.close()

    b.close()

json.dump(R, open('/root/alwled/frontend/tools/qa/stage3g/shots3g-after.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('shots:', len(R['shots']))
print('collisions:', json.dumps(R['collisions'], ensure_ascii=False, indent=1))
unnamed = [n for n in R['names'] if not n['name']]
print('عناصر بلا اسم متاح:', len(unnamed), 'من', len(R['names']))
for n in unnamed[:14]:
    print('   ', n)
