# لقطة مقصوصة على رأس قسم العروض + زر النهاية للتحقق البصري الدقيق
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 900}, device_scale_factor=2)
    pg.goto("https://panel.fahd-car.cloud/alwled/shop/", wait_until='networkidle')
    pg.wait_for_timeout(2500)
    r = pg.evaluate("""(() => {
      const s = document.querySelector('#shop-home-offers');
      s.scrollIntoView({block: 'start'});
      window.scrollBy(0, -60);
      const head = s.querySelector('.shop-section__head').getBoundingClientRect();
      const grid = s.querySelector('.shop-grid').getBoundingClientRect();
      const cta = s.querySelector('.shop-section__endcta').getBoundingClientRect();
      return {headY: head.y, gridY: grid.y, ctaY: cta.y, ctaBottom: cta.bottom};
    })()""")
    pg.wait_for_timeout(400)
    # لقطة من رأس القسم حتى زر النهاية
    pg.screenshot(path='/root/alwled/frontend/tools/qa/stage5/home-offers-head.png',
                  clip={'x': 0, 'y': 0, 'width': 390, 'height': 500})
    b.close()
print('saved')
