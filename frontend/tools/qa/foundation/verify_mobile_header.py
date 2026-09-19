"""MOBILE HEADER HOTFIX — فحص قبول كامل بالمواصفات: صف واحد · انحراف مركز ≤1px · مقاسات · فراغ محذوف."""
import json
import sys

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/foundation'
WIDTHS = [360, 390, 430, 600, 640, 768, 769, 900, 1023, 1024, 1152, 1280, 1366]
RES, FAIL, M = [], [], {}

PROBE = """(() => {
  const hdr = document.querySelector('.shop-header');
  const inner = document.querySelector('.shop-header__inner');
  const box = (s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), cy: +(r.top + r.height / 2).toFixed(1) }; };
  const brand = box('.shop-brand'), search = box('#shop-search-btn'), cart = box('.shop-cartbtn'), menu = box('#shop-burger');
  const vis = Array.from(inner.children).filter(e => getComputedStyle(e).display !== 'none');
  // عدد الصفوف الحقيقي = عدد المراكز الرأسية المتمايزة (>12px فرق)
  const cys = vis.map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; });
  const rows = cys.reduce((acc, cy) => acc.some(v => Math.abs(v - cy) < 12) ? acc : acc.concat(cy), []).length;
  const ctrl = [brand, search, cart, menu].filter(Boolean).map(o => o.cy);
  const dev = ctrl.length > 1 ? +(Math.max(...ctrl) - Math.min(...ctrl)).toFixed(1) : 0;
  const ticker = document.querySelector('.shop-home-ticker, .shop-ticker, .shop-announce');
  const main = document.querySelector('#shop-view > *');
  const nextTop = (ticker || main) ? Math.round((ticker || main).getBoundingClientRect().top) : null;
  const rowH = Math.round(inner.getBoundingClientRect().height);
  const combinedH = Math.round(hdr.getBoundingClientRect().height);
  const qn = document.querySelector('#shop-quicknav');
  const qnH = qn && getComputedStyle(qn).display !== 'none' ? Math.round(qn.getBoundingClientRect().height) : 0;
  return { hdrH: rowH, combinedH, qnH, rows, dev, brand, search, cart, menu,
    nextTop, gapAfterHeader: nextTop === null ? null : nextTop - Math.round(hdr.getBoundingClientRect().bottom),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    wrap: getComputedStyle(inner).flexWrap }; })()"""


def chk(n, ok, d=''):
    RES.append((n, bool(ok), d)); print('%s %-52s %s' % ('✓' if ok else '✗', n, str(d)[:96]))
    if not ok:
        FAIL.append(n + ' :: ' + str(d))


with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': 844}, locale='ar')
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2400)
        r = p.evaluate(PROBE); M[w] = r
        mobile = w <= 1023
        print('\n— %dpx —' % w)
        chk('[%d] صف واحد' % w, r['rows'] == 1, 'rows=%d' % r['rows'])
        chk('[%d] صف الهيدر ≤78px' % w, r['hdrH'] <= 78, 'row=%d' % r['hdrH'])
        chk('[%d] الشريط السريع 44–48px والمجموع = الصف + الشريط' % w,
            (r['qnH'] == 0 if w > 1023 else 44 <= r['qnH'] <= 48) and abs(r['combinedH'] - (r['hdrH'] + r['qnH'])) <= 2,
            'qn=%d combined=%d' % (r['qnH'], r['combinedH']))
        chk('[%d] بلا فائض أفقي' % w, r['ov'] == 0, 'ov=%d' % r['ov'])
        chk('[%d] انحراف المركز ≤1px' % w, r['dev'] <= 1, 'dev=%s' % r['dev'])
        if mobile:
            chk('[%d] القائمة في نفس الصف (لا التفاف)' % w,
                r['menu'] and r['brand'] and abs(r['menu']['cy'] - r['brand']['cy']) <= 1,
                'menu.y=%s brand.cy=%s' % (r['menu']['y'], r['brand']['cy']))
            chk('[%d] أزرار ≥44×44' % w,
                all(r[k] and r[k]['w'] >= 44 and r[k]['h'] >= 44 for k in ('search', 'cart', 'menu')),
                's=%sx%s c=%sx%s m=%sx%s' % (r['search']['w'], r['search']['h'], r['cart']['w'], r['cart']['h'], r['menu']['w'], r['menu']['h']))
            chk('[%d] لا التفاف (nowrap)' % w, r['wrap'] == 'nowrap', r['wrap'])
            chk('[%d] الفراغ تحت الهيدر ≤16px (لا ~80px فراغ)' % w, r['gapAfterHeader'] is not None and r['gapAfterHeader'] <= 16,
                'gap=%s (nextTop=%s)' % (r['gapAfterHeader'], r['nextTop']))
        else:
            chk('[%d] ديسكتوب: بلا قائمة/برغر' % w, r['menu'] is None and r['search'] is None, 'menu=%s search=%s' % (r['menu'], r['search']))
        ctx.close()

    # لقطات (مع المحتوى تحت الهيدر)
    for w, h, theme, name in [(390, 844, 'light', 'mhx-390-light'), (390, 844, 'dark', 'mhx-390-dark'), (430, 932, 'light', 'mhx-430-light')]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, locale='ar')
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2400)
        if theme == 'dark':
            p.evaluate("document.documentElement.setAttribute('data-theme','dark')")
            p.evaluate("try{localStorage.setItem('shop-theme','dark')}catch(e){}"); p.wait_for_timeout(500)
        p.screenshot(path='%s/%s.png' % (OUT, name), clip={'x': 0, 'y': 0, 'width': w, 'height': 300})
        ctx.close()
    b.close()

print('\n=== MOBILE HEADER HOTFIX: %d/%d ===' % (len(RES) - len(FAIL), len(RES)))
for f in FAIL:
    print('  ✗', f)
json.dump(M, open(OUT + '/mobile-header-hotfix.json', 'w'), ensure_ascii=False, indent=1)
sys.exit(1 if FAIL else 0)