"""PHASE 5 — تدقيق مستقل (adversarial) لتقرير التنفيذ: شبكة/خطوط/ألوان دلالية/حقول/صفحات إضافية/200% للأسطح الناقصة."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage5/'
R = {'net': {}, 'fonts': {}, 'status': {}, 'inputs': {}, 'extra': {}, 'cssvars': {}, 'zoom_extra': {}}

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url))
    cons = []
    page.on('console', lambda m: cons.append(m.type + ':' + m.text[:90]) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: cons.append('pageerror:' + str(e)[:90]))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2500)
    for h in ['#/products', '#/products/632', '#/cart', '#/checkout', '#/orders', '#/notifications', '#/account', '#/']:
        page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(1800)
    # ===== 1) الشبكة: أي طلب خط أو نطاق خارجي؟ =====
    R['net']['total'] = len(reqs)
    R['net']['fonts'] = [u for u in reqs if any(x in u.lower() for x in ('.woff', '.ttf', '.otf', 'font'))]
    hosts = sorted({u.split('/')[2] for u in reqs if '://' in u})
    R['net']['hosts'] = hosts
    R['net']['external'] = [u for u in reqs if u.split('/')[2] not in ('panel.fahd-car.cloud',)]
    # ===== 2) الخطوط: هل Cairo هو المُصيَّر فعلًا؟ =====
    R['fonts']['resolve'] = page.evaluate("""(() => {
      const cv = document.createElement('canvas').getContext('2d');
      const w = f => { cv.font = '600 40px ' + f; return Math.round(cv.measureText('الوليد للأجهزة الكهربائية 12345').width); };
      const faces = Array.from(document.fonts).map(f => f.family + '/' + f.weight + '/' + f.status);
      const stack = getComputedStyle(document.body).fontFamily;
      return { cairo: w('Cairo'), tahoma: w('Tahoma'), arial: w('Arial'), declared: w(stack),
        stack: stack, faces: faces, cairo_loaded: document.fonts.check('16px "Cairo"'),
        qomra_loaded: document.fonts.check('16px "Qomra Arabic"') }; })()""")
    # ===== 3) الألوان الدلالية (danger/success/warning) لم تُحوَّل لأزرق =====
    R['status']['badge'] = page.evaluate("""(() => { const e = document.querySelector('.badge--danger, .shop-card .badge');
      return e ? { cls: e.className, bg: getComputedStyle(e).backgroundColor, col: getComputedStyle(e).color, txt: e.textContent.trim().slice(0,12) } : null; })()""")
    R['status']['toast'] = page.evaluate("""(() => { const out = {};
      ['--store-danger','--store-success','--store-warning','--store-info','--store-primary'].forEach(v => out[v] = getComputedStyle(document.body).getPropertyValue(v).trim());
      return out; })()""")
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2400)
    page.click('#shop-add-to-cart'); page.wait_for_timeout(1400)
    R['status']['authbtn'] = page.evaluate("""(() => { const b = document.querySelector('.btn--primary');
      return b ? { bg: getComputedStyle(b).backgroundColor, col: getComputedStyle(b).color } : null; })()""")
    R['cssvars'] = page.evaluate("""(() => {
      const bad = []; let checked = 0;
      for (const ss of document.styleSheets) {
        let rules; try { rules = ss.cssRules; } catch (e) { continue; }
        for (const r of rules) {
          if (!r.selectorText || !r.cssText.includes('var(--st-')) continue;
          if (/^(html|body|:root|\\*)/.test(r.selectorText.trim())) { bad.push('ROOT-SCOPE:' + r.selectorText.slice(0,40)); continue; }
          try { checked++; const els = document.querySelectorAll(r.selectorText.split(',')[0]);
            for (const el of els) { if (!el.closest('.shop-body')) { bad.push(r.selectorText.slice(0, 40) + ' OUTSIDE'); break; } } } catch (e) {}
        } }
      return { checked: checked, bad: bad.slice(0, 8) }; })()""")
    R['console'] = cons
    ctx.close()

    # ===== 4) الحقول على الجوال ≥16px + أسطح إضافية (payment/verification) =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2400)
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2300)
    R['inputs']['products'] = page.evaluate("""(() => { const out = [];
      ['#shop-filter-search','#shop-filter-category','#shop-filter-brand','#shop-filter-sort','.shop-check'].forEach(s => {
        const e = document.querySelector(s); if (e) out.push({ s: s, fs: getComputedStyle(e).fontSize, h: Math.round(e.getBoundingClientRect().height) }); });
      return out; })()""")
    page.click('#shop-search-btn'); page.wait_for_timeout(800)
    R['inputs']['search'] = page.evaluate("(() => { const e = document.querySelector('.shop-search-sheet__input'); return e ? getComputedStyle(e).fontSize : null; })()")
    page.keyboard.press('Escape'); page.wait_for_timeout(600)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2400)
    R['inputs']['qty'] = page.evaluate("(() => { const e = document.querySelector('#shop-qty'); return e ? getComputedStyle(e).fontSize : null; })()")
    # أسطح إضافية: routes
    for h in ['#/payment', '#/verification', '#/order', '#/orders/1']:
        page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(2000)
        R['extra'][h] = page.evaluate("""(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          url: location.hash, txt: (document.querySelector('#shop-view') || document.body).textContent.trim().slice(0, 60) }))()""")
    # ===== 5) 200% للأسطح الناقصة: القائمة/البحث/الفلاتر/نافذة المصادقة =====
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2300)
    page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(800)
    page.evaluate("document.getElementById('shop-filters-toggle').click()"); page.wait_for_timeout(1000)
    R['zoom_extra']['filters'] = page.evaluate("""(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sheet: (() => { const s = document.querySelector('.shop-filters__sheet'); if (!s) return null; const b = s.getBoundingClientRect();
        return { box: [Math.round(b.width), Math.round(b.height)], sw: s.scrollWidth, cw: s.clientWidth,
          wide: Array.from(s.querySelectorAll('*')).filter(k => k.scrollWidth > k.clientWidth + 2).slice(0,3).map(k => String(k.className).slice(0,22)) }; })() }))()""")
    page.keyboard.press('Escape'); page.wait_for_timeout(700)
    page.evaluate("document.documentElement.style.fontSize = ''"); page.wait_for_timeout(400)
    page.evaluate('location.hash = "#/"'); page.wait_for_timeout(2200)
    page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(800)
    page.click('#shop-search-btn'); page.wait_for_timeout(800)
    page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1600)
    R['zoom_extra']['search'] = page.evaluate("""(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      row: (() => { const e = document.querySelector('.shop-search-row'); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(),
      wide: Array.from(document.querySelectorAll('.shop-search-sheet *')).filter(k => k.scrollWidth > k.clientWidth + 2).slice(0,3).map(k => String(k.className).slice(0,22)) }))()""")
    page.keyboard.press('Escape'); page.wait_for_timeout(700)
    page.click('#shop-burger'); page.wait_for_timeout(900)
    R['zoom_extra']['menu'] = page.evaluate("""(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      link: (() => { const e = document.querySelector('.shop-drawer__link'); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(),
      wide: Array.from(document.querySelectorAll('.shop-drawer__panel *')).filter(k => k.scrollWidth > k.clientWidth + 2).slice(0,3).map(k => String(k.className).slice(0,22)) }))()""")
    page.keyboard.press('Escape'); page.wait_for_timeout(600)
    page.evaluate("document.documentElement.style.fontSize = ''"); page.wait_for_timeout(300)
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2400)
    page.evaluate("document.documentElement.style.fontSize = '200%'"); page.wait_for_timeout(800)
    try:
        page.click('#shop-add-to-cart'); page.wait_for_timeout(1300)
    except Exception:
        pass
    R['zoom_extra']['authdlg'] = page.evaluate("""(() => ({ ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wide: Array.from(document.querySelectorAll('[role=dialog] *, .modal *')).filter(k => k.scrollWidth > k.clientWidth + 2).slice(0,3).map(k => String(k.className).slice(0,22)),
      btn: (() => { const b = document.querySelector('[role=dialog] .btn--primary, .modal .btn--primary'); if (!b) return null; const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() }))()""")
    ctx.close()
    b.close()

with open(OUT + 'independent-audit.json', 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('NET total=%d | font-reqs=%s' % (R['net']['total'], R['net']['fonts']))
print('HOSTS=%s' % R['net']['hosts'])
print('EXTERNAL=%s' % (R['net']['external'][:3] or 'لا شيء'))
print('FONT resolve:', json.dumps(R['fonts']['resolve'], ensure_ascii=False)[:420])
print('STATUS:', json.dumps(R['status'], ensure_ascii=False)[:400])
print('CSSVARS:', json.dumps(R['cssvars'], ensure_ascii=False))
print('INPUTS:', json.dumps(R['inputs'], ensure_ascii=False))
print('EXTRA ROUTES:', json.dumps(R['extra'], ensure_ascii=False)[:400])
print('ZOOM-EXTRA:', json.dumps(R['zoom_extra'], ensure_ascii=False)[:700])
print('CONSOLE:', R['console'][:4])
