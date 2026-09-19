from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for theme in ('light','dark'):
        ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar')
        if theme=='dark': ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        p=ctx.new_page(); errs=[]
        p.on('console', lambda m: errs.append(m.text[:100]) if m.type=='error' else None)
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1400)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1900)
        d=p.evaluate("""(() => { const C=s=>{const e=document.querySelector(s); if(!e) return null; const c=getComputedStyle(e);
            return {bg:c.backgroundColor, color:c.color, border:c.borderTopColor};};
          return {theme: document.documentElement.getAttribute('data-theme'), add:C('.shop-card__add'), badge:C('.shop-card__flags .badge'),
            toolbar:C('.shop-toolbar'), input:C('#shop-filter-search'), count:C('.shop-toolbar__count'), card: document.querySelectorAll('.shop-card').length}; })()""")
        print(theme, d)
        print('  errors:', errs)
        ctx.close()
    b.close()
