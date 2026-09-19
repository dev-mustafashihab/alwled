from playwright.sync_api import sync_playwright
import json
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3a'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for name,h in [('category_results','#/products?categoryId=293'),('brand_results','#/products?brandId=254')]:
        ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
        p.evaluate('location.hash = "%s"' % h); p.wait_for_timeout(1800)
        p.screenshot(path=OUT+'/%s-1366.png'%name); ctx.close()
    # فتح المنتج: صورة/اسم/تفاصيل/جسم البطاقة
    ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1800)
    R['card_click']={}
    # 1) النقر على الصورة
    p.click('.shop-card__media'); p.wait_for_timeout(1800)
    R['card_click']['after_media']={'hash':p.evaluate('location.hash'),'h1':p.evaluate("(document.querySelector('#shop-view h1')||{}).textContent")}
    p.go_back(); p.wait_for_timeout(1800)
    # 2) النقر على الاسم
    p.click('.shop-card__name a'); p.wait_for_timeout(1800)
    R['card_click']['after_name']={'hash':p.evaluate('location.hash'),'h1':p.evaluate("(document.querySelector('#shop-view h1')||{}).textContent")}
    p.go_back(); p.wait_for_timeout(1800)
    # 3) زر التفاصيل
    p.click('.shop-card__details'); p.wait_for_timeout(1800)
    R['card_click']['after_details']={'hash':p.evaluate('location.hash'),'h1':p.evaluate("(document.querySelector('#shop-view h1')||{}).textContent")}
    p.go_back(); p.wait_for_timeout(1800)
    # 4) النقر على جسم البطاقة (منطقة فارغة)
    before=p.evaluate('location.hash')
    box=p.evaluate("""(() => { const b=document.querySelector('.shop-card__body').getBoundingClientRect(); return {x:b.x+8,y:b.y+4}; })()""")
    p.mouse.click(box['x'], box['y']); p.wait_for_timeout(1200)
    R['card_click']['body_click']={'before':before,'after':p.evaluate('location.hash'),'changed': before!=p.evaluate('location.hash')}
    # 5) النقر على السعر/الشارة
    R['card_click']['price_is_link']=p.evaluate("!!document.querySelector('.shop-price').closest('a')")
    R['card_click']['badge_is_link']=p.evaluate("!!document.querySelector('.shop-card .badge').closest('a')")
    R['card_click']['card_is_link']=p.evaluate("document.querySelector('.shop-card').tagName")
    b.close()
json.dump(R, open(OUT+'/card-click.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1))
