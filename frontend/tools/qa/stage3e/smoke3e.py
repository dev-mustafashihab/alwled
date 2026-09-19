from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for w in (360,390,600,768,900,1024,1366,1920):
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page(); errs=[]
        p.on('console', lambda m: errs.append(m.text[:90]) if m.type=='error' else None)
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1300)
        p.evaluate('location.hash = "#/products?view=categories"'); p.wait_for_timeout(1700)
        d=p.evaluate("""(() => { const g=document.querySelector('#shop-view > .shop-taxonomy');
          const its=Array.from(document.querySelectorAll('#shop-view > .shop-taxonomy > .shop-taxonomy__item'));
          return {cols:getComputedStyle(g).gridTemplateColumns, gridW:Math.round(g.getBoundingClientRect().width),
            ov:document.documentElement.scrollWidth-document.documentElement.clientWidth,
            cards: its.map(i=>({w:Math.round(i.getBoundingClientRect().width), h:Math.round(i.getBoundingClientRect().height), x:Math.round(i.getBoundingClientRect().x)}))}; })()""")
        print('%-5d cols=%-42s cards=%s ov=%s errs=%s' % (w, d['cols'][:42], d['cards'], d['ov'], errs))
        ctx.close()
    b.close()
