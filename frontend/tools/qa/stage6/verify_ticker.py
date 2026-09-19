"""تحقق إصلاح شريط الإعلانات: بلا فراغ · 200% مقروء · قارئ الشاشة · الهندسة · console."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
GAP = """(() => { const vp = document.querySelector('.shop-home-ticker__viewport'); const vr = vp.getBoundingClientRect();
  const items = Array.from(document.querySelectorAll('.shop-home-ticker__track > .shop-home-ticker__item'));
  let maxR = vr.left, minL = vr.right;
  items.forEach(e => { const b = e.getBoundingClientRect(); if (b.right > vr.left && b.left < vr.right) { maxR = Math.max(maxR, b.right); minL = Math.min(minL, b.left); } });
  return { right_gap: Math.round(vr.right - maxR), left_gap: Math.round(minL - vr.left),
    vp_w: Math.round(vr.width), items: items.length, tf: getComputedStyle(document.querySelector('.shop-home-ticker__track')).transform }; })()"""
INFO = """(() => { const t = document.getElementById('shop-home-ticker'); const cs = getComputedStyle(t);
  const vp = t.querySelector('.shop-home-ticker__viewport'); const it = t.querySelector('.shop-home-ticker__item');
  const b = t.getBoundingClientRect(); const tr = t.querySelector('.shop-home-ticker__track');
  return { box: [Math.round(b.width), Math.round(b.height)], vp_h: Math.round(vp.getBoundingClientRect().height),
    track_h: Math.round(tr.getBoundingClientRect().height), item_fs: getComputedStyle(it).fontSize,
    item_lh: getComputedStyle(it).lineHeight, item_dir: getComputedStyle(it).direction, track_dir: getComputedStyle(tr).direction,
    vp_aria_hidden: vp.getAttribute('aria-hidden'), items: t.querySelectorAll('.shop-home-ticker__item').length,
    hidden_items: Array.from(t.querySelectorAll('.shop-home-ticker__track > *')).filter(c => c.getAttribute('aria-hidden') === 'true').length,
    sr_text: (t.querySelector('.visually-hidden') || {}).textContent, bg: cs.backgroundColor, col: cs.color }; })()"""

with sync_playwright() as pw:
    b = pw.chromium.launch()
    R = {}
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        p = ctx.new_page()
        cons = []
        p.on('console', lambda m: cons.append(m.type + ':' + m.text[:90]) if m.type in ('error', 'warning') else None)
        p.on('pageerror', lambda e: cons.append('pageerror:' + str(e)[:90]))
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(3000)
        p.evaluate('location.hash = "#/"'); p.wait_for_timeout(2600)
        R['info_%d' % w] = p.evaluate(INFO)
        # 12 عيّنة على دورة كاملة (26s) — نراقب الفراغ
        gaps = []
        for i in range(12):
            gaps.append(p.evaluate(GAP))
            p.wait_for_timeout(2300)
        R['gaps_%d' % w] = gaps
        # 200%
        p.evaluate("document.documentElement.style.fontSize='200%'"); p.wait_for_timeout(900)
        R['zoom_%d' % w] = p.evaluate("""(() => { const t = document.getElementById('shop-home-ticker');
          const vp = t.querySelector('.shop-home-ticker__viewport'); const tr = t.querySelector('.shop-home-ticker__track');
          const it = t.querySelector('.shop-home-ticker__item'); const b = t.getBoundingClientRect();
          const ir = it.getBoundingClientRect(); const vr = vp.getBoundingClientRect();
          return { box: [Math.round(b.width), Math.round(b.height)], vp_h: Math.round(vr.height), track_h: Math.round(tr.getBoundingClientRect().height),
            item_fs: getComputedStyle(it).fontSize, item_lh: getComputedStyle(it).lineHeight,
            text_inside: (ir.top >= vr.top - 1) && (ir.bottom <= vr.bottom + 1), ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
        R['console_%d' % w] = cons
        ctx.close()
    b.close()
with open('/root/alwled/frontend/tools/qa/stage6/ticker-result.json', 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('written')
print('--- gaps 1366 (right_gap / left_gap) ---')
print([(g['right_gap'], g['left_gap']) for g in R['gaps_1366']])
print('--- gaps 390 ---')
print([(g['right_gap'], g['left_gap']) for g in R['gaps_390']])
