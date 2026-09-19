from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3b'
with sync_playwright() as pw:
    b=pw.chromium.launch()
    # A: 390 products top
    ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1300)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1700)
    p.screenshot(path=OUT+'/after-products-390.png'); ctx.close()
    # إضافي: 769 و 1024 مع فلتر مطبّق (لقطة تفاعل) + 1920
    for w,name,hash_ in [(769,'after-products-769',None),(1024,'after-toolbar-interaction-1024','#/products?categoryId=293&sortBy=price&sortOrder=asc'),
                          (1366,'after-toolbar-interaction-1366','#/products?search=%D8%AB%D9%84%D8%A7%D8%AC%D8%A9'),
                          (1920,'after-products-1920',None)]:
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1300)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1500)
        if hash_:
            p.evaluate('location.hash = "%s"' % hash_); p.wait_for_timeout(1700)
        p.screenshot(path=OUT+'/%s.png'%name); ctx.close()
    b.close()
print('done')
