from playwright.sync_api import sync_playwright
import json
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
tests=[('none','#/products'),('min400','#/products?minPrice=400'),('max400','#/products?maxPrice=400'),('min99999','#/products?minPrice=99999'),('page2','#/products?page=2'),('neg','#/products?minPrice=-5'),('malformed','#/products?minPrice=abc')]
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
    errs=[]; p.on('console', lambda m: errs.append(m.text[:120]) if m.type=='error' else None)
    reqs=[]; p.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/products' in r.url else None)
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1400)
    for label,h in tests:
        reqs.clear()
        p.evaluate('location.hash = "%s"' % h); p.wait_for_timeout(1900)
        d=p.evaluate("""(() => ({hash:location.hash, cards:document.querySelectorAll('.shop-card').length,
          count:(document.querySelector('.shop-toolbar__count')||{}).textContent, empty:!!document.querySelector('.state--empty')}))()""")
        print('%-10s %-34s req=%-58s cards=%s count=%s empty=%s' % (label, d['hash'][:34], (reqs[0] if reqs else '-')[:58], d['cards'], d['count'], d['empty']))
    print('console errors:', errs)
    b.close()
