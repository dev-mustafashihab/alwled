from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},locale='ar',device_scale_factor=2)
    p=ctx.new_page()
    p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1800)
    p.evaluate('window.scrollTo(0,1200)'); p.wait_for_timeout(400)
    p.click('#shop-search-btn'); p.wait_for_timeout(800)
    p.screenshot(path='before-390-search-scroll1200.png')
    print(p.evaluate("""(()=>{const h=document.querySelector('.shop-header').getBoundingClientRect();
      const s=document.getElementById('shop-search-sheet').getBoundingClientRect();
      return {header:h.top+'..'+h.bottom, sheetTop:s.top, scrollY:window.scrollY,
              htmlOverflow:getComputedStyle(document.documentElement).overflow,
              headerPos:getComputedStyle(document.querySelector('.shop-header')).position};})()"""))
    # فحص إتاحة البحث بعد تنفيذ بحث فعلي
    p.fill('#shop-search-sheet-input','لمبة'); p.wait_for_timeout(2200)
    print(p.evaluate("""(()=>{const n=document.querySelectorAll('[role=status]');
      return Array.from(n).map(x=>({cls:x.className,live:x.getAttribute('aria-live'),atomic:x.getAttribute('aria-atomic'),txt:(x.textContent||'').slice(0,40)}));})()"""))
    b.close()
