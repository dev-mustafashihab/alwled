import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3a'
PAGES=[('products','#/products'),('categories','#/products?view=categories'),('brands','#/products?view=brands'),
       ('category_results','#/products?categoryId=293'),('brand_results','#/products?brandId=254'),('empty','#/products?search=zzzznothing')]
WIDTHS=[360,390,430,600,768,1024,1280,1366,1440,1920]
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for name,h in PAGES:
        for w in WIDTHS:
            ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page()
            p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1100)
            p.evaluate('location.hash = "%s"' % h); p.wait_for_timeout(1400)
            R['%s_%d'%(name,w)] = p.evaluate("""(() => { const d=document.documentElement;
              const q=s=>document.querySelector(s);
              const inner = s => { const e=q(s); return e ? {sw:e.scrollWidth, cw:e.clientWidth, diff:e.scrollWidth-e.clientWidth, ox:getComputedStyle(e).overflowX} : null; };
              return {doc:{sw:d.scrollWidth, cw:d.clientWidth, diff:d.scrollWidth-d.clientWidth},
                body:{sw:document.body.scrollWidth, cw:document.body.clientWidth},
                view: inner('#shop-view'), grid: inner('.shop-grid'), taxo: inner('.shop-taxonomy'),
                toolbar: inner('.shop-toolbar'), crumbs: inner('.shop-crumbs'), sheet: inner('.shop-filters__sheet'),
                cards: document.querySelectorAll('.shop-card').length, taxoItems: document.querySelectorAll('.shop-taxonomy__item').length}; })()""")
            ctx.close()
        print(name, 'ok')
    b.close()
json.dump(R, open(OUT+'/overflow-matrix.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('done')
