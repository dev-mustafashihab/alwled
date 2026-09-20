# قياس فوتر الديسكتوب 768/1366: الارتفاع + أطول العناصر
from playwright.sync_api import sync_playwright
import json

BASE = "http://127.0.0.1:5173/shop/"

JS_MEASURE = """(() => {
  const f = document.querySelector('.shop-footer');
  if (!f) return {error: 'no footer'};
  const h = f.getBoundingClientRect().height;
  const items = [];
  f.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) items.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 60),
      h: Math.round(r.height),
      text: (el.textContent || '').trim().slice(0, 40)
    });
  });
  // فقط العناصر "الورقية" الظاهرة (لا يوجد سليل أطول يغطيها) — نأخذ الأطول 12
  items.sort((a, b) => b.h - a.h);
  const seen = new Set();
  const top = [];
  for (const it of items) {
    const key = it.tag + '|' + it.cls;
    if (!seen.has(key)) { seen.add(key); top.push(it); }
    if (top.length >= 14) break;
  }
  const cs = getComputedStyle(f);
  return {height: Math.round(h), padding: cs.paddingBlockStart + '/' + cs.paddingBlockEnd,
          gap: cs.rowGap, top};
})()"""

with sync_playwright() as p:
    b = p.chromium.launch()
    out = {}
    for w, name in [(768, '768'), (1366, '1366'), (390, '390-check')]:
        pg = b.new_page(viewport={'width': w, 'height': 900})
        pg.goto(BASE, wait_until='networkidle')
        pg.wait_for_timeout(1200)
        # ننزل للفوتر
        pg.evaluate("document.querySelector('.shop-footer')?.scrollIntoView()")
        pg.wait_for_timeout(400)
        out[name] = pg.evaluate(JS_MEASURE)
        pg.screenshot(path=f'/root/alwled/frontend/tools/qa/stage5/desk-{name}-footer.png')
        pg.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
