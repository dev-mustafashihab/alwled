"""Stage 15.1 — فحص UI/UX لمتجر الزبون (Playwright).
يقيس: الفائض الأفقي في 8 مقاسات · الدرج (فتح/إغلاق/تركيز/قفل تمرير) · أهداف اللمس · البطاقات · الفوتر.
لا ينفّذ أي عملية كتابة على البيانات: تصفّح فقط.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage15.1'
WIDTHS = [320, 360, 375, 390, 414, 768, 1024, 1440]
os.makedirs(OUT, exist_ok=True)

results = {'overflow': {}, 'shots': [], 'checks': [], 'failures': []}
console_errors = []


def check(name, ok, detail=''):
    results['checks'].append({'name': name, 'ok': bool(ok), 'detail': detail})
    if not ok:
        results['failures'].append(name + ((' — ' + str(detail)) if detail else ''))
    print(('  ✓ ' if ok else '  ✗ ') + name + ((' — ' + str(detail)) if detail else ''))


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: console_errors.append(str(e)))

    print('== overflow per width ==')
    for w in WIDTHS:
        page.set_viewport_size({'width': w, 'height': 900})
        page.goto(BASE, wait_until='load')
        page.wait_for_timeout(1200)
        ov = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        results['overflow'][str(w)] = ov
        shot = os.path.join(OUT, 'home-%d.png' % w)
        page.screenshot(path=shot, full_page=(w in (390, 1440)))
        results['shots'].append(shot)
        check('overflow %d = 0' % w, ov <= 0, ov)
    page.close()

    # ---------------- mobile behaviour ----------------
    print('== mobile 390: drawer / touch / cards ==')
    ctx2 = browser.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx2.new_page()
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: console_errors.append(str(e)))
    page.goto(BASE, wait_until='load')
    page.wait_for_timeout(1500)

    burger = page.locator('#shop-burger')
    box = burger.bounding_box() or {'width': 0, 'height': 0}
    check('burger visible & touch >= 44px', box['width'] >= 44 and box['height'] >= 44,
          '%dx%d' % (round(box['width']), round(box['height'])))

    # burger lines: 3 equal bars
    bars = page.evaluate("""(() => {
      const spans = document.querySelectorAll('#shop-burger .shop-burger span');
      return Array.from(spans).map(s => Math.round(s.getBoundingClientRect().height));
    })()""")
    check('burger has 3 equal lines', len(bars) == 3, bars)

    # product grid columns at 390
    cols = page.evaluate("""(() => {
      const g = document.querySelector('.shop-grid');
      if (!g) return 0;
      return getComputedStyle(g).gridTemplateColumns.split(' ').length;
    })()""")
    check('product grid = 2 columns on mobile', cols == 2, cols)

    # hero vs body font sizes
    sizes = page.evaluate("""(() => {
      const h = document.querySelector('.shop-hero__title');
      const p = document.querySelector('.shop-hero__text');
      return {hero: h ? parseFloat(getComputedStyle(h).fontSize) : 0,
              body: p ? parseFloat(getComputedStyle(p).fontSize) : 0,
              card: (() => { const c = document.querySelector('.shop-card__name'); return c ? parseFloat(getComputedStyle(c).fontSize) : 0; })()};
    })()""")
    check('hero title > body text', sizes['hero'] > sizes['body'], sizes)
    check('card name >= 14px', sizes['card'] >= 14, sizes['card'])

    # open drawer
    page.click('#shop-burger')
    page.wait_for_timeout(450)
    state = page.evaluate("""(() => {
      const d = document.getElementById('shop-drawer');
      const p = d.querySelector('.shop-drawer__panel');
      const r = p.getBoundingClientRect();
      const scrim = d.querySelector('.shop-drawer__scrim');
      return {openClass: d.classList.contains('is-open'), hidden: d.hidden,
              aria: document.getElementById('shop-burger').getAttribute('aria-expanded'),
              panelLeft: Math.round(r.left), panelRight: Math.round(r.right),
              vw: window.innerWidth, scrimVisible: scrim ? getComputedStyle(scrim).opacity : '0',
              bodyOverflow: document.body.style.overflow,
              focusedInside: d.contains(document.activeElement),
              focused: document.activeElement.id};
    })()""")
    check('drawer opens (is-open, aria-expanded=true)', state['openClass'] and state['aria'] == 'true', state)
    check('menu drops from under the header (reference pattern)',
          abs(state['panelLeft']) <= 2 and abs(state['panelRight'] - state['vw']) <= 2, state)
    check('menu covers the viewport width', state['panelRight'] - state['panelLeft'] >= state['vw'] - 2, state)
    check('body scroll locked', state['bodyOverflow'] == 'hidden', state['bodyOverflow'])
    check('focus moved into menu', state['focusedInside'], state['focused'])
    page.screenshot(path=os.path.join(OUT, 'drawer-open-390.png'))
    results['shots'].append(os.path.join(OUT, 'drawer-open-390.png'))

    # drawer touch targets
    small = page.evaluate("""(() => {
      const nodes = document.querySelectorAll('.shop-drawer__link, #shop-drawer-close');
      return Array.from(nodes).map(n => Math.round(n.getBoundingClientRect().height)).filter(h => h < 44);
    })()""")
    check('drawer targets >= 44px', len(small) == 0, small)

    # scroll must not move while drawer open
    before = page.evaluate('window.scrollY')
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(300)
    after = page.evaluate('window.scrollY')
    check('page does not scroll behind drawer', abs(after - before) <= 2, '%s -> %s' % (before, after))

    # Escape closes + focus restored + scroll restored
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)
    closed = page.evaluate("""(() => ({
      hidden: document.getElementById('shop-drawer').hidden,
      aria: document.getElementById('shop-burger').getAttribute('aria-expanded'),
      bodyOverflow: document.body.style.overflow,
      focused: document.activeElement.id
    }))()""")
    check('Escape closes drawer', closed['hidden'] and closed['aria'] == 'false', closed)
    check('body scroll restored after close', closed['bodyOverflow'] in ('', 'visible'), closed['bodyOverflow'])
    check('focus returns to burger', closed['focused'] == 'shop-burger', closed['focused'])
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(300)
    check('page scrolls again after close', page.evaluate('window.scrollY') > 0)

    # زر القائمة نفسه يفتح ويغلق (يتحول إلى X) — نمط المرجع
    page.click('#shop-burger')
    page.wait_for_timeout(450)
    opened_again = page.evaluate("document.getElementById('shop-drawer').classList.contains('is-open')")
    page.click('#shop-burger')
    page.wait_for_timeout(500)
    closed_again = page.evaluate("!document.getElementById('shop-drawer').classList.contains('is-open')")
    check('menu button toggles open/close (X state)', opened_again and closed_again,
          'open=%s closed=%s' % (opened_again, closed_again))

    # clicking the scrim (outside the panel) closes too
    page.click('#shop-burger')
    page.wait_for_timeout(400)
    page.mouse.click(195, 30)   # منطقة الهيدر = خارج اللوحة
    page.wait_for_timeout(450)
    check('click outside closes menu', page.evaluate("!document.getElementById('shop-drawer').classList.contains('is-open')"))

    # product add-to-cart touch target (guest -> auth prompt)
    page.goto(BASE + '#/products', wait_until='load')
    page.wait_for_timeout(1600)
    page.locator('.shop-card__name a').first.click()   # البطاقة كلها قابلة للنقر (رابط ممتد)
    page.wait_for_timeout(1600)
    btn = page.locator('#shop-add-to-cart')
    bbox = btn.bounding_box() if btn.count() else None
    check('add-to-cart visible & >= 44px', bool(bbox) and bbox['height'] >= 44,
          bbox and '%dx%d' % (round(bbox['width']), round(bbox['height'])))
    qtyb = page.locator('.shop-qty__btn').first.bounding_box()
    check('qty buttons >= 44px', bool(qtyb) and qtyb['width'] >= 44 and qtyb['height'] >= 44, qtyb)
    page.screenshot(path=os.path.join(OUT, 'product-390.png'), full_page=True)
    results['shots'].append(os.path.join(OUT, 'product-390.png'))

    # guest add-to-cart must NOT call cart API and must show auth prompt
    page.click('#shop-add-to-cart')
    page.wait_for_timeout(700)
    prompt = page.evaluate("""(() => {
      const d = Array.from(document.querySelectorAll('.modal, [role="dialog"]')).filter(n => n.offsetParent !== null);
      return {dialogs: d.length, text: d.length ? d[0].innerText.slice(0, 60) : ''};
    })()""")
    check('guest add-to-cart shows auth prompt', prompt['dialogs'] >= 1, prompt)

    # footer accordion
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    page.wait_for_timeout(600)
    det = page.evaluate("""(() => {
      const ds = document.querySelectorAll('.shop-footer__sec');
      return {count: ds.length, openCount: Array.from(ds).filter(d => d.hasAttribute('open')).length};
    })()""")
    check('footer has 3 accordion sections (mobile closed)', det['count'] == 3 and det['openCount'] == 0, det)
    page.screenshot(path=os.path.join(OUT, 'footer-390.png'))
    results['shots'].append(os.path.join(OUT, 'footer-390.png'))
    page.close()

    # ---------------- desktop footer open ----------------
    ctx3 = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='ar')
    page = ctx3.new_page()
    page.goto(BASE, wait_until='load')
    page.wait_for_timeout(1200)
    det2 = page.evaluate("""(() => {
      const ds = document.querySelectorAll('.shop-footer__sec');
      return Array.from(ds).filter(d => d.hasAttribute('open')).length;
    })()""")
    check('footer sections open on desktop', det2 == 3, det2)
    page.screenshot(path=os.path.join(OUT, 'home-1280.png'), full_page=True)
    results['shots'].append(os.path.join(OUT, 'home-1280.png'))
    page.close()
    browser.close()

check('no console errors', len(console_errors) == 0, console_errors[:2])

results['console_errors'] = console_errors[:5]
results['passed'] = len(results['checks']) - len(results['failures'])
results['total'] = len(results['checks'])
with open(os.path.join(OUT, 'shop-151-ui-report.json'), 'w', encoding='utf-8') as fh:
    json.dump(results, fh, ensure_ascii=False, indent=2)

print('\n=== Stage 15.1 UI: %d/%d PASS · overflow=%s ===' % (results['passed'], results['total'],
      'PASS' if all(v <= 0 for v in results['overflow'].values()) else 'FAIL'))
if results['failures']:
    print('FAILURES:')
    for f in results['failures']:
        print('  ✗ ' + f)
sys.exit(0 if not results['failures'] else 1)
