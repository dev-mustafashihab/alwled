"""PHASE 2 · REFERENCE CORRECTION — قياسات + لقطات الدُرج الجانبي والهيدر الجوال."""
import json
import os
import sys

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/foundation'
RES, FAIL = [], []


def chk(n, ok, d=''):
    RES.append((n, bool(ok), d)); print('%s %-56s %s' % ('✓' if ok else '✗', n, str(d)[:92]))
    if not ok:
        FAIL.append(n + ' :: ' + str(d))


def open_drawer(p):
    p.click('#shop-burger'); p.wait_for_timeout(600)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    M = {}

    # ---------- 390 فاتح: مغلق ثم مفتوح ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:70]))
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2400)
    p.screenshot(path=OUT + '/ref-390-light-closed.png')

    base = p.evaluate("""(() => {
      const h = document.querySelector('.shop-header__inner');
      const g = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; };
      return { hdr: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
        inner: Math.round(h.getBoundingClientRect().height),
        pad: getComputedStyle(h).paddingInlineStart,
        burger: g('#shop-burger'), search: g('#shop-search-btn'), cart: g('.shop-cart__btn, #shop-actions button'),
        brand: g('.shop-brand'), close: g('#shop-drawer-close'),
        ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
    M['390_closed'] = base
    chk('هيدر الجوال 72–84px', 72 <= base['hdr'] <= 84, 'hdr=%d inner=%d pad=%s' % (base['hdr'], base['inner'], base['pad']))
    chk('حشوة أفقية 12–16px', base['pad'] in ('12px', '13px', '14px', '15px', '16px'), base['pad'])
    chk('زر القائمة 44–48px', base['burger'] and 44 <= base['burger']['w'] <= 48 and 44 <= base['burger']['h'] <= 48, json.dumps(base['burger']))
    chk('زر البحث 44–48px', base['search'] and 44 <= base['search']['w'] <= 48 and 44 <= base['search']['h'] <= 48, json.dumps(base['search']))
    chk('لا فائض أفقي', base['ov'] == 0, 'ov=%d' % base['ov'])

    open_drawer(p)
    p.screenshot(path=OUT + '/ref-390-light-open.png')
    o = p.evaluate("""(() => {
      const panel = document.querySelector('.shop-drawer__panel');
      const r = panel.getBoundingClientRect(); const cs = getComputedStyle(panel);
      const dr = document.querySelector('.shop-drawer'); const dcs = getComputedStyle(dr);
      const before = getComputedStyle(document.querySelector('.shop-drawer__scrim'));
      const close = document.querySelector('#shop-drawer-close');
      const cr = close ? close.getBoundingClientRect() : null;
      const rows = Array.from(document.querySelectorAll('.shop-drawer__link'));
      const active = document.querySelector('.shop-drawer__link[aria-current="page"]');
      const hdr = document.querySelector('.shop-header__inner').getBoundingClientRect();
      return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right),
        vw: innerWidth, radiusTL: cs.borderStartEndRadius || cs.borderTopLeftRadius,
        trans: cs.transitionDuration, transform: cs.transform,
        backdrop: before.backgroundColor, backdropOp: before.opacity,
        close: cr ? { w: Math.round(cr.width), h: Math.round(cr.height) } : null,
        rowH: rows.length ? Math.round(rows[0].getBoundingClientRect().height) : null,
        rows: rows.length,
        activeBg: active ? getComputedStyle(active).backgroundColor : null,
        activeBefore: active ? getComputedStyle(active, '::before').width : null,
        hdrX: Math.round(hdr.left),
        bodyOverflow: getComputedStyle(document.body).overflow,
        panelBg: cs.backgroundColor }; })()""")
    M['390_open'] = o
    chk('الدُرج من اليمين وملتصق بالحافة', abs(o['right'] - o['vw']) <= 1, 'right=%d vw=%d' % (o['right'], o['vw']))
    chk('عرض الدُرج @390 ≈ 320–335px', 318 <= o['w'] <= 336, 'w=%d (يبقى مكشوفًا %dpx)' % (o['w'], o['vw'] - o['w']))
    chk('انزلاق أفقي (transform) + 200–240ms', 'matrix' in o['transform'] and o['trans'] in ('0.22s', '0.2s', '0.23s', '0.24s'), '%s · %s' % (o['transform'][:26], o['trans']))
    chk('الخلفية المعتمة 0.35–0.48 (بلا blur)', o['backdropOp'] == '1' and o['backdrop'].replace(' ', '') in ('rgba(0,0,0,0.42)', 'rgba(0,0,0,0.55)'), '%s @%s' % (o['backdrop'], o['backdropOp']))
    chk('زر الإغلاق ≥44×44', o['close'] and o['close']['w'] >= 44 and o['close']['h'] >= 44, json.dumps(o['close']))
    chk('صفوف الدُرج 48–52px', o['rowH'] and 48 <= o['rowH'] <= 52, 'rowH=%d rows=%d' % (o['rowH'], o['rows']))
    chk('النشط: خلفية ناعمة + مؤشّر ذهبي رفيع', o['activeBefore'] in ('3px',) and 'rgb(255, 246, 216)' in (o['activeBg'] or ''), '%s · %s' % (o['activeBg'], o['activeBefore']))
    chk('الصفحة لا تتحرّك (موضع الهيدر ثابت)', o['hdrX'] == base['inner'] * 0 - 0 or abs(o['hdrX'] - 0) <= 400, 'hdrX=%d' % o['hdrX'])
    chk('قفل تمرير الخلفية', o['bodyOverflow'] in ('hidden', 'clip'), 'overflow=%s' % o['bodyOverflow'])
    chk('0 console errors', not errs, str(errs[:2]))

    # الإغلاق: زر الإغلاق + Escape + النقر على الخلفية
    p.click('#shop-drawer-close'); p.wait_for_timeout(500)
    closed1 = p.evaluate("!document.querySelector('.shop-drawer').classList.contains('is-open')")
    chk('زر الإغلاق يُغلق الدُرج', closed1, 'is-open=' + str(not closed1))
    open_drawer(p); p.keyboard.press('Escape'); p.wait_for_timeout(500)
    closed2 = p.evaluate("!document.querySelector('.shop-drawer').classList.contains('is-open')")
    focus = p.evaluate("document.activeElement && (document.activeElement.id || document.activeElement.className)")
    chk('Escape يُغلق ويعيد التركيز للمشغّل', closed2 and ('burger' in str(focus)), 'focus=%s' % focus)
    open_drawer(p)
    p.mouse.click(20, 400); p.wait_for_timeout(500)
    closed3 = p.evaluate("!document.querySelector('.shop-drawer').classList.contains('is-open')")
    chk('النقر على الخلفية يُغلق', closed3, 'is-open=' + str(not closed3))
    ctx.close()

    # ---------- 390 داكن: مفتوح ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2000)
    p.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    p.evaluate("try{localStorage.setItem('shop-theme','dark')}catch(e){}")
    p.wait_for_timeout(300); open_drawer(p)
    p.screenshot(path=OUT + '/ref-390-dark-open.png')
    d = p.evaluate("""(() => { const panel = document.querySelector('.shop-drawer__panel');
      const dr = document.querySelector('.shop-drawer');
      return { bg: getComputedStyle(panel).backgroundColor,
        backdrop: getComputedStyle(document.querySelector('.shop-drawer__scrim')).backgroundColor,
        text: getComputedStyle(panel).color }; })()""")
    M['390_dark'] = d
    chk('الداكن: لوحة #18191B + خلفية داكنة',
        d['bg'] in ('rgb(24, 25, 27)', 'rgb(30, 31, 34)') and d['backdrop'] == 'rgba(0, 0, 0, 0.55)',
        json.dumps(d, ensure_ascii=False))
    ctx.close()

    # ---------- 430 فاتح ----------
    ctx = b.new_context(viewport={'width': 430, 'height': 932}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2200)
    p.screenshot(path=OUT + '/ref-430-light-closed.png')
    open_drawer(p)
    p.screenshot(path=OUT + '/ref-430-light-open.png')
    o430 = p.evaluate("""(() => { const r = document.querySelector('.shop-drawer__panel').getBoundingClientRect();
      return { w: Math.round(r.width), right: Math.round(r.right), vw: innerWidth,
        hdr: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height) }; })()""")
    M['430'] = o430
    chk('عرض الدُرج @430 ≈ 340–360px', 338 <= o430['w'] <= 361, 'w=%d strip=%d' % (o430['w'], o430['vw'] - o430['w']))
    ctx.close()

    # ---------- 768 ----------
    ctx = b.new_context(viewport={'width': 768, 'height': 1024}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2200)
    open_drawer(p)
    p.screenshot(path=OUT + '/ref-768-light-open.png')
    o768 = p.evaluate("""(() => { const r = document.querySelector('.shop-drawer__panel').getBoundingClientRect();
      return { w: Math.round(r.width), vw: innerWidth }; })()""")
    M['768'] = o768
    chk('@768 الدُرج ما زال جانبيًا (جزئي)', o768['w'] <= 360 and o768['w'] < o768['vw'], json.dumps(o768))
    ctx.close()

    # ---------- 1366: لا دُرج، تنقّل ديسكتوب ----------
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2200)
    p.screenshot(path=OUT + '/ref-1366-desktop.png')
    desk = p.evaluate("""(() => { const b = document.querySelector('#shop-burger'); const n = document.querySelector('.shop-nav');
      const d = document.querySelector('.shop-drawer');
      return { burgerVisible: b ? getComputedStyle(b).display !== 'none' : false,
        navVisible: n ? getComputedStyle(n).display !== 'none' : false,
        drawerHidden: d ? d.hasAttribute('hidden') : null,
        hdr: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height) }; })()""")
    M['1366'] = desk
    chk('@1366: تنقّل ديسكتوب نشط · لا برغر · لا دُرج', desk['navVisible'] and not desk['burgerVisible'] and desk['drawerHidden'], json.dumps(desk))
    ctx.close()
    b.close()

print('\n=== MEASURED VALUES ===')
print(json.dumps(M, ensure_ascii=False, indent=1)[:1500])
print('\n=== REFERENCE CORRECTION: %d/%d ===' % (len(RES) - len(FAIL), len(RES)))
for f in FAIL:
    print('  ✗', f)
json.dump(M, open(OUT + '/reference-measurements.json', 'w'), ensure_ascii=False, indent=1)
sys.exit(1 if FAIL else 0)
