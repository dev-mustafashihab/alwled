# زوم دقيق على أزرار الهيدر: ارتفاعات فعلية ومحاذاة رأسية
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1366, 'height': 900})
    pg.goto("https://panel.fahd-car.cloud/alwled/shop/", wait_until='networkidle')
    pg.wait_for_timeout(1500)
    r = pg.evaluate("""(() => {
      const get = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        const c = getComputedStyle(e);
        return {text: (e.textContent || '').trim().slice(0, 15), x: Math.round(r.x), y: Math.round(r.y),
                bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height),
                display: c.display, minH: c.minHeight, fs: c.fontSize};
      };
      return {
        header: get('.shop-header__inner'),
        searchBtn: get('.shop-search__btn'),
        cart: get('.shop-cartbtn'),
        login: get("a[href='#/login']"),
        register: get("a[href='#/register']"),
      };
    })()""")
    print(json.dumps(r, ensure_ascii=False, indent=1))
    b.close()
