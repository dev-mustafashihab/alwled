from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
cases=[('page2_min400','#/products?page=2&minPrice=400'),('page2_offers','#/products?page=2&offers=1'),
       ('page5_brand','#/products?page=5&brandId=254'),('page1','#/products?page=1'),('page2_cat','#/products?page=2&categoryId=293')]
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
    errs=[]; p.on('console', lambda m: errs.append(m.text[:100]) if m.type=='error' else None)
    reqs=[]; p.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/products' in r.url else None)
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1400)
    for label,h in cases:
        reqs.clear()
        p.evaluate('location.hash = "%s"' % h); p.wait_for_timeout(2500)
        d=p.evaluate("""(() => ({hash:location.hash, cards:document.querySelectorAll('.shop-card').length,
          count:(document.querySelector('.shop-toolbar__count')||{}).textContent, empty:!!document.querySelector('.state--empty'),
          pag: !!document.querySelector('.pagination')}))()""")
        print('%-14s → hash=%-32s cards=%s count=%-9s empty=%-5s products_reqs=%d' % (label, d['hash'][:32], d['cards'], d['count'], d['empty'], len(reqs)))
    print('console errors:', errs)
    b.close()
