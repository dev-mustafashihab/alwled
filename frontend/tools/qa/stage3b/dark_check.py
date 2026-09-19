from playwright.sync_api import sync_playwright
import json
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar')
    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
    p=ctx.new_page(); p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1300)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1800)
    d=p.evaluate("""(() => { const C=(s)=>{const e=document.querySelector(s); if(!e) return null; const c=getComputedStyle(e);
        return {bg:c.backgroundColor, color:c.color, border:c.borderTopColor, h:Math.round(e.getBoundingClientRect().height)};};
      return {theme: document.documentElement.getAttribute('data-theme'),
        search: C('#shop-filter-search'), cat: C('#shop-filter-category'), brand: C('#shop-filter-brand'),
        sort: C('#shop-filter-sort'), min: C('#shop-filter-minprice'), max: C('#shop-filter-maxprice'),
        check: C('.shop-check'), checkSpan: C('.shop-check span'),
        count: C('.shop-toolbar__count'), label: C('.shop-toolbar__label'),
        toolbar: C('.shop-toolbar'), pageBg: getComputedStyle(document.body).backgroundColor}; })()""")
    print(json.dumps(d, ensure_ascii=False, indent=1))
    b.close()
