# تصيّد الطلبات التي ترجع >=400 على صفحة المتجر
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/shop/"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 900})
    bad = []
    pg.on('response', lambda r: bad.append((r.status, r.url)) if r.status >= 400 else None)
    pg.goto(BASE, wait_until='networkidle')
    pg.wait_for_timeout(2000)
    b.close()
for s, u in bad:
    print(s, u)
print('TOTAL', len(bad))
