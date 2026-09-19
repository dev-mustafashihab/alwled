"""PHASE 2 · STEP 2D.1 — قياس التكوين العمودي للقائمة (قبل/بعد).

الاستخدام: python3 compose_probe.py before|after
يقيس: منطقة التمرير الفعلية · المسافات (آخر بند→الفاصل/المظهر · مظهر→ملاحظة · ملاحظة→CTA ·
الفراغ بعد CTA) · مدى التمرير · إمكانية الوصول لكل عنصر · الفائض · لقطات · انحدار وظيفي.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage2d1'
os.makedirs(OUT, exist_ok=True)

report = {'tag': TAG, 'sizes': {}, 'functional': {}, 'console_errors': [], 'shots': []}

JS = """(() => {
  const px = v => Math.round(v);
  const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return {top: px(b.top), bottom: px(b.bottom), h: px(b.height), w: px(b.width), x: px(b.x)}; };
  const q = s => document.querySelector(s);
  const panel = q('.shop-drawer__panel');
  const drawer = q('#shop-drawer');
  const scroll = q('#shop-menu-scroll');
  const theme = q('.shop-menu__theme');
  const divider = q('.shop-drawer__panel > .shop-menu__divider');
  const foot = q('.shop-drawer__foot');
  const note = q('.shop-drawer__foot .shop-note');
  const cta = q('.shop-drawer__foot .btn');
  const rows = Array.from(document.querySelectorAll('.shop-drawer__link')).filter(l => l.getBoundingClientRect().height > 0);
  const lastRow = rows[rows.length - 1];
  const labels = Array.from(document.querySelectorAll('.shop-menu__label')).filter(l => l.getBoundingClientRect().height > 0);
  const lastLabel = labels[labels.length - 1];
  // منطقة التمرير الفعلية: أول سلف قابل للتمرير فعلاً
  let scroller = null, node = lastRow;
  while (node && node !== document.body) {
    const cs = getComputedStyle(node);
    if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1) { scroller = node; break; }
    node = node.parentElement;
  }
  const sc = scroller || scroll;
  const pR = R(panel), dR = R(drawer), sR = R(sc), tR = R(theme), vR = R(divider), fR = R(foot);
  const nR = R(note), cR = R(cta), lrR = R(lastRow), llR = R(lastLabel);
  const all = [lrR, vR, tR, nR, cR].filter(Boolean);
  const maxBottom = Math.max.apply(null, all.map(r => r.bottom));
  return {
    viewport: {w: window.innerWidth, h: window.innerHeight},
    drawer: dR, panel: pR,
    scroller: sc ? {cls: String(sc.className), id: sc.id, top: sR.top, bottom: sR.bottom,
                    clientH: px(sc.clientHeight), contentH: px(sc.scrollHeight),
                    maxScroll: px(sc.scrollHeight - sc.clientHeight),
                    overflowY: getComputedStyle(sc).overflowY, flex: getComputedStyle(sc).flex,
                    paddingTop: getComputedStyle(sc).paddingBlockStart, paddingBottom: getComputedStyle(sc).paddingBlockEnd} : null,
    lastRow: lrR, lastRowText: lastRow ? (lastRow.textContent || '').trim().slice(0, 18) : null,
    lastLabel: llR,
    divider: vR, theme: tR, foot: fR, note: nR, cta: cR,
    gaps: {
      lastRow_to_divider: lrR && vR ? px(vR.top - lrR.bottom) : null,
      lastRow_to_theme: lrR && tR ? px(tR.top - lrR.bottom) : null,
      theme_to_note: tR && nR ? px(nR.top - tR.bottom) : null,
      theme_to_foot: tR && fR ? px(fR.top - tR.bottom) : null,
      note_to_cta: nR && cR ? px(cR.top - nR.bottom) : null,
      cta_to_panelBottom: cR && pR ? px(pR.bottom - cR.bottom) : null,
      lastElement_to_panelBottom: pR ? px(pR.bottom - maxBottom) : null
    },
    reachable: {lastRow: lrR ? lrR.bottom <= pR.bottom + 0.5 : null,
                theme: tR ? tR.bottom <= pR.bottom + 0.5 : null,
                cta: cR ? cR.bottom <= pR.bottom + 0.5 : null,
                allInsidePanel: maxBottom <= pR.bottom + 0.5},
    counts: {rows: rows.length, labels: labels.length,
             guestBlockVisible: !!(q('.shop-menu__guest') && q('.shop-menu__guest').getBoundingClientRect().height > 0),
             accountBlockVisible: !!(q('.shop-menu__account') && q('.shop-menu__account').getBoundingClientRect().height > 0)},
    overflow: {doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
               drawer: drawer.scrollWidth - drawer.clientWidth},
    pageScrollY: Math.round(window.scrollY),
    headerBottom: px(q('.shop-header').getBoundingClientRect().bottom),
    drawerTop: dR.top
  };
})()"""

LOGIN = """async () => { try { const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
  window.ALW.session.start(res); window.ALW.app.refreshShell(); await window.ALW.app.refreshNotifications(true);
  return true; } catch (e) { return String(e); } }"""

SIZES = [(360, 780), (390, 844), (390, 700), (390, 600), (430, 900), (600, 900), (768, 1000)]

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---------- Guest ----------
    for w, h in SIZES:
        ctx = b.new_context(viewport={'width': w, 'height': h}, locale='ar',
                            device_scale_factor=2 if w < 768 else 1)
        page = ctx.new_page()
        page.on('console', lambda m: report['console_errors'].append('console: ' + m.text)
                if m.type == 'error' else None)
        page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1600)
        page.click('#shop-burger')
        page.wait_for_timeout(850)
        page.mouse.move(w / 2, h - 8)
        page.wait_for_timeout(200)
        key = 'guest-%dx%d' % (w, h)
        d = page.evaluate(JS)
        report['sizes'][key] = d
        p = os.path.join(OUT, '%s-%s.png' % (TAG, key))
        page.screenshot(path=p)
        report['shots'].append(p)
        if (w, h) in [(390, 600), (768, 1000)]:
            page.evaluate("""(() => { const s = document.getElementById('shop-menu-scroll');
              if (s) s.scrollTop = s.scrollHeight;
              const pn = document.querySelector('.shop-drawer__panel'); if (pn) pn.scrollTop = pn.scrollHeight; })()""")
            page.wait_for_timeout(400)
            d2 = page.evaluate(JS)
            report['sizes'][key + '-bottom'] = d2
            p = os.path.join(OUT, '%s-%s-bottom.png' % (TAG, key))
            page.screenshot(path=p)
            report['shots'].append(p)
        print('== %s == scroller=%s maxScroll=%s gaps=%s reach=%s' % (
            key, d['scroller'] and (d['scroller']['id'] or d['scroller']['cls']), d['scroller'] and d['scroller']['maxScroll'],
            d['gaps'], d['reachable']['allInsidePanel']))
        ctx.close()

    # ---------- Authenticated ----------
    for w, h in [(390, 844), (390, 700), (390, 600)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, locale='ar', device_scale_factor=2)
        page = ctx.new_page()
        page.on('console', lambda m: report['console_errors'].append('console: ' + m.text)
                if m.type == 'error' else None)
        page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1500)
        ok = page.evaluate(LOGIN)
        page.wait_for_timeout(2300)
        if ok is not True:
            report['sizes']['auth-%dx%d' % (w, h)] = {'login_failed': str(ok)}
            print('auth login failed', ok)
            ctx.close()
            continue
        page.click('#shop-burger')
        page.wait_for_timeout(850)
        page.mouse.move(w / 2, h - 8)
        page.wait_for_timeout(200)
        key = 'auth-%dx%d' % (w, h)
        d = page.evaluate(JS)
        report['sizes'][key] = d
        p = os.path.join(OUT, '%s-%s.png' % (TAG, key))
        page.screenshot(path=p)
        report['shots'].append(p)
        if (w, h) == (390, 600):
            page.evaluate("""(() => { const s = document.getElementById('shop-menu-scroll');
              if (s) s.scrollTop = s.scrollHeight;
              const pn = document.querySelector('.shop-drawer__panel'); if (pn) pn.scrollTop = pn.scrollHeight; })()""")
            page.wait_for_timeout(400)
            report['sizes'][key + '-bottom'] = page.evaluate(JS)
            p = os.path.join(OUT, '%s-%s-bottom.png' % (TAG, key))
            page.screenshot(path=p)
            report['shots'].append(p)
        print('== %s == rows=%s scroller=%s maxScroll=%s gaps=%s reach=%s' % (
            key, d['counts']['rows'], d['scroller'] and (d['scroller']['id'] or d['scroller']['cls']),
            d['scroller'] and d['scroller']['maxScroll'], d['gaps'], d['reachable']))
        ctx.close()

    # ---------- Desktop regression ----------
    ctx = b.new_context(viewport={'width': 1024, 'height': 800}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1500)
    report['desktop'] = page.evaluate("""(() => { const b = document.getElementById('shop-burger');
      const d = document.getElementById('shop-drawer');
      return {burgerDisplay: getComputedStyle(b).display, drawerHidden: d.hidden,
              headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
              drawerTop: Math.round(d.getBoundingClientRect().top),
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()""")
    print('desktop:', report['desktop'])
    ctx.close()

    # ---------- Functional regression (390×844) ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', device_scale_factor=2)
    page = ctx.new_page()
    page.on('console', lambda m: report['console_errors'].append('console: ' + m.text)
            if m.type == 'error' else None)
    page.on('pageerror', lambda e: report['console_errors'].append('pageerror: ' + str(e)))
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1600)
    f = {}
    page.click('#shop-burger')
    page.wait_for_timeout(800)
    f['open'] = page.evaluate("""(() => { const d = document.getElementById('shop-drawer');
      const a = document.activeElement;
      return {open: d.classList.contains('is-open'), ariaHidden: d.getAttribute('aria-hidden'),
              expanded: document.getElementById('shop-burger').getAttribute('aria-expanded'),
              activeInDrawer: d.contains(a), bodyOverflow: getComputedStyle(document.body).overflowY,
              htmlOverflow: getComputedStyle(document.documentElement).overflowY, scrollY: window.scrollY}; })()""")
    ids = []
    for _ in range(16):
        page.keyboard.press('Tab')
        page.wait_for_timeout(60)
        ids.append(page.evaluate("""(() => { const a = document.activeElement;
          return document.getElementById('shop-drawer').contains(a); })()"""))
    f['focus_trap_all_inside'] = all(ids)
    page.keyboard.press('Escape')
    page.wait_for_timeout(600)
    f['escape'] = page.evaluate("""(() => ({hidden: document.getElementById('shop-drawer').hidden,
      active: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null,
      expanded: document.getElementById('shop-burger').getAttribute('aria-expanded'),
      bodyOverflow: getComputedStyle(document.body).overflowY}))()""")
    page.click('#shop-burger')
    page.wait_for_timeout(700)
    page.click(".shop-menu__theme-btn[data-theme-mode='dark']")
    page.wait_for_timeout(500)
    f['theme'] = page.evaluate("""(() => ({theme: document.documentElement.getAttribute('data-theme'),
      pressed: Array.from(document.querySelectorAll('.shop-menu__theme-btn')).map(b => b.getAttribute('aria-pressed')),
      thumb: (() => { const t = document.querySelector('.shop-menu__theme-thumb'); const a = document.querySelector('.shop-menu__theme-btn.is-active');
        return t && a ? {thumbW: Math.round(t.getBoundingClientRect().width), btnW: Math.round(a.getBoundingClientRect().width),
                         thumbX: Math.round(t.getBoundingClientRect().x), btnX: Math.round(a.getBoundingClientRect().x)} : null; })()}))()""")
    p = os.path.join(OUT, '%s-dark-390x844.png' % TAG)
    page.screenshot(path=p)
    report['shots'].append(p)
    page.click(".shop-menu__theme-btn[data-theme-mode='system']")
    page.wait_for_timeout(400)
    # تمرير داخلي (على 600 سيكون هناك تمرير)
    page.set_viewport_size({'width': 390, 'height': 600})
    page.wait_for_timeout(600)
    page.evaluate("""(() => { const s = document.getElementById('shop-menu-scroll');
      s.scrollTop = s.scrollHeight; })()""")
    page.wait_for_timeout(700)
    f['internal_scroll'] = page.evaluate("""(() => { const s = document.getElementById('shop-menu-scroll');
      return {scrollTop: Math.round(s.scrollTop), max: Math.round(s.scrollHeight - s.clientHeight),
              pageScrollY: Math.round(window.scrollY),
              bodyOverflow: getComputedStyle(document.body).overflowY,
              htmlOverflow: getComputedStyle(document.documentElement).overflowY}; })()""")
    page.wait_for_timeout(200)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(500)
    before_hash = page.evaluate('location.hash')
    page.click("#shop-drawer a[href='#/products']")
    page.wait_for_timeout(900)
    f['nav_click'] = {'before': before_hash, 'after': page.evaluate("""(() => ({hash: location.hash,
      hidden: document.getElementById('shop-drawer').hidden, bodyOverflow: getComputedStyle(document.body).overflowY}))()""")}
    page.click('#shop-burger')
    page.wait_for_timeout(700)
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.set_viewport_size({'width': 1200, 'height': 844})
    page.wait_for_timeout(700)
    f['resize_1024'] = page.evaluate("""(() => ({w: window.innerWidth,
      hidden: document.getElementById('shop-drawer').hidden,
      burger: getComputedStyle(document.getElementById('shop-burger')).display}))()""")
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(500)
    page.click('#shop-search-btn')
    page.wait_for_timeout(700)
    f['search'] = page.evaluate("""(() => { const s = document.getElementById('shop-search-sheet');
      const h = document.querySelector('.shop-header');
      return {open: s.classList.contains('is-open'), sheetTop: Math.round(s.getBoundingClientRect().top),
              headerBottom: Math.round(h.getBoundingClientRect().bottom)}; })()""")
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    f['search_closed'] = page.evaluate("document.getElementById('shop-search-sheet').hidden")
    report['functional'] = f
    ctx.close()
    b.close()

path = os.path.join(OUT, 'compose-%s.json' % TAG)
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(report, fh, ensure_ascii=False, indent=2)
print('\nreport:', path)
print('console errors:', len(report['console_errors']))
