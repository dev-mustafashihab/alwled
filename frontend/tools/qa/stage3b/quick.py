from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for w in (768, 769, 1024, 1366):
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1200)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1600)
        d=p.evaluate("""(() => { const tb=document.querySelector('.shop-toolbar'); const t=document.getElementById('shop-filters-toggle');
          const vis=e=>{if(!e)return false;const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).display!=='none';};
          const cs=tb?getComputedStyle(tb):null;
          return {tb:vis(tb), tbH:tb?Math.round(tb.getBoundingClientRect().height):0, cols:cs?cs.gridTemplateColumns:null,
            toggle:vis(t), sheet:getComputedStyle(document.querySelector('.shop-filters__sheet')).display,
            controls:Array.from(document.querySelectorAll('.shop-toolbar input, .shop-toolbar select')).filter(vis).length,
            count:vis(document.querySelector('.shop-toolbar__count')), gridTop:Math.round(document.querySelector('.shop-grid').getBoundingClientRect().top),
            ov:document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()""")
        print(w, d)
        ctx.close()
    b.close()
