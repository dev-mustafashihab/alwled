import sys
from playwright.sync_api import sync_playwright
MODE=sys.argv[1]
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3c'
CASES=[('minPrice400','#/products?minPrice=400'),('minPrice99999','#/products?minPrice=99999'),('page2','#/products?page=2'),('offers','#/products?offers=1')]
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for name,h in CASES:
        ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1400)
        p.evaluate('location.hash = "%s"' % h); p.wait_for_timeout(2000)
        p.screenshot(path='%s/%s-%s.png'%(OUT,MODE,name)); ctx.close()
    b.close()
print('done', MODE)
