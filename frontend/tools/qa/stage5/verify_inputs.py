"""تحقق الحقول ≥16px على كل أسطح الزبون + الهندسة المقفلة بعد إصلاح 5F."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
R = {}
INP = """(() => { const out = [];
  document.querySelectorAll('#shop-view input, #shop-view select, #shop-view textarea, [role=dialog] input, .modal input').forEach(e => {
    const t = e.type || e.tagName; if (t === 'checkbox' || t === 'radio' || t === 'hidden') return;
    const b = e.getBoundingClientRect(); if (!b.width || !b.height) return;
    out.push({ id: (e.id || String(e.className).slice(0, 22)), fs: getComputedStyle(e).fontSize, box: Math.round(b.width) + 'x' + Math.round(b.height) }); });
  const seen = {}; return out.filter(o => { const k = o.id + o.fs; if (seen[k]) return false; seen[k] = 1; return true; }); })()"""
GEO = """(() => { const q = s => document.querySelector(s); const box = s => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
  return { hdr: box('.shop-header__inner'), card: box('#shop-view > .shop-grid > .shop-card'), toolbar: box('.shop-toolbar'), fsearch: box('#shop-filter-search'),
    fselect: box('#shop-filter-category'), toggle: box('.shop-filters__toggle'), crumbs: box('.shop-crumbs a'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()"""

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        cons = []
        page.on('console', lambda m: cons.append(m.type + ':' + m.text[:80]) if m.type in ('error', 'warning') else None)
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2400)
        page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2400)
        R['inputs_products_%d' % w] = page.evaluate(INP)
        R['geo_products_%d' % w] = page.evaluate(GEO)
        if w <= 768:
            page.evaluate("document.getElementById('shop-filters-toggle').click()"); page.wait_for_timeout(900)
            R['inputs_sheet_%d' % w] = page.evaluate(INP)
            page.keyboard.press('Escape'); page.wait_for_timeout(600)
        for h, n in [('#/cart', 'cart'), ('#/checkout', 'checkout'), ('#/account', 'account')]:
            page.evaluate('location.hash = "%s"' % h); page.wait_for_timeout(2100)
            R['inputs_%s_%d' % (n, w)] = page.evaluate(INP)
        page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2400)
        try:
            page.click('#shop-add-to-cart'); page.wait_for_timeout(1400)
        except Exception:
            pass
        R['inputs_authdlg_%d' % w] = page.evaluate(INP)
        R['geo_pdp_%d' % w] = page.evaluate(GEO)
        R['console_%d' % w] = cons
        ctx.close()
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1)[:3000])
