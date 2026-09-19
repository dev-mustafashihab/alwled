"""MOBILE HEADER — تشخيص دقيق: صفوف · مواضع · مقاسات · انحراف المركز."""
import json
import sys

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
WIDTHS = [360, 390, 430, 600, 640, 768, 769, 900, 1023, 1024, 1152, 1280, 1366]

PROBE = """(() => {
  const hdr = document.querySelector('.shop-header');
  const inner = document.querySelector('.shop-header__inner');
  const vis = (s) => { const e = document.querySelector(s);
    if (!e) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), cy: +(r.top + r.height / 2).toFixed(1) }; };
  const brand = vis('.shop-brand'), search = vis('#shop-search-btn'), cart = vis('.shop-cartbtn, #shop-actions'),
        menu = vis('#shop-burger');
  const kids = Array.from(inner.children).filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
  const tops = kids.map(e => Math.round(e.getBoundingClientRect().top));
  const rows = new Set(tops.map(t => Math.round(t / 20))).size;
  const cys = [brand, search, cart, menu].filter(Boolean).map(o => o.cy);
  const dev = cys.length > 1 ? +(Math.max(...cys) - Math.min(...cys)).toFixed(1) : 0;
  return { hdrH: Math.round(hdr.getBoundingClientRect().height), rows, topSpread: Math.max(...tops) - Math.min(...tops),
    brand, search, cart, menu, centerDev: dev,
    wrap: getComputedStyle(inner).flexWrap,
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    innerW: Math.round(inner.getBoundingClientRect().width) };
})()"""

out = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': 844}, locale='ar')
        p = ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2300)
        r = p.evaluate(PROBE)
        out[w] = r
        print('%-5d hdr=%-4d rows=%d spread=%-3d dev=%-4s wrap=%-6s ov=%-3d | logo %s | search %s | cart %s | menu %s' % (
            w, r['hdrH'], r['rows'], r['topSpread'], r['centerDev'], r['wrap'], r['ov'],
            (('%dx%d@y%d' % (r['brand']['w'], r['brand']['h'], r['brand']['y'])) if r['brand'] else '—'),
            (('%dx%d@y%d' % (r['search']['w'], r['search']['h'], r['search']['y'])) if r['search'] else '—'),
            (('%dx%d@y%d' % (r['cart']['w'], r['cart']['h'], r['cart']['y'])) if r['cart'] else '—'),
            (('%dx%d@y%d' % (r['menu']['w'], r['menu']['h'], r['menu']['y'])) if r['menu'] else '—')))
        if w in (390, 430):
            p.screenshot(path='/root/alwled/frontend/tools/qa/foundation/mhx-%d-before.png' % w, clip={'x': 0, 'y': 0, 'width': w, 'height': 320})
        ctx.close()
    b.close()
json.dump(out, open('/root/alwled/frontend/tools/qa/foundation/mobile-header-diagnosis.json', 'w'), ensure_ascii=False, indent=1)