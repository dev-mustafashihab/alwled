import os
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3g/shots'
def ring(p):
    return p.evaluate("""(() => { const a=document.activeElement; if(!a) return null; const cs=getComputedStyle(a);
      return {cls:String(a.className).slice(0,34), id:a.id, outline:cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor}; })()""")
def tab_until(p, sel, maxn=40):
    for i in range(maxn):
        p.keyboard.press('Tab'); p.wait_for_timeout(80)
        hit = p.evaluate("(() => { const a=document.activeElement; return a ? a.matches('%s') : false; })()" % sel)
        if hit: return True
    return False
with sync_playwright() as pw:
    b=pw.chromium.launch()
    # 390: opener / add / card link / taxonomy
    ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1900)
    p.evaluate('document.body.focus()')
    tab_until(p, '#shop-filters-toggle')
    print('opener:', ring(p)); p.screenshot(path=OUT+'/kf-390-opener.png')
    p.keyboard.press('Enter'); p.wait_for_timeout(800)
    print('after open focus:', ring(p)); p.screenshot(path=OUT+'/kf-390-close.png')
    # checkbox عبر Tab داخل اللوحة
    tab_until(p, '#shop-filter-offers', 14)
    print('checkbox:', ring(p)); p.screenshot(path=OUT+'/kf-390-checkbox.png')
    p.keyboard.press('Escape'); p.wait_for_timeout(700)
    tab_until(p, '.shop-card__add', 30)
    print('add:', ring(p)); p.screenshot(path=OUT+'/kf-390-add.png')
    tab_until(p, '.shop-card__media', 6)
    print('cardlink:', ring(p)); p.screenshot(path=OUT+'/kf-390-cardlink.png')
    p.evaluate('location.hash = "#/products?view=categories"'); p.wait_for_timeout(1900)
    p.evaluate('document.body.focus()')
    tab_until(p, '.shop-taxonomy__item', 30)
    print('taxonomy390:', ring(p)); p.screenshot(path=OUT+'/kf-390-taxonomy.png')
    ctx.close()
    # 1366: card link / taxonomy / retry
    ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1900)
    p.evaluate('document.body.focus()')
    tab_until(p, '.shop-card__media', 30)
    print('cardlink1366:', ring(p)); p.screenshot(path=OUT+'/kf-1366-cardlink.png')
    p.evaluate('location.hash = "#/products?view=categories"'); p.wait_for_timeout(1900)
    p.evaluate('document.body.focus()')
    tab_until(p, '.shop-taxonomy__item', 30)
    print('taxonomy1366:', ring(p)); p.screenshot(path=OUT+'/kf-1366-taxonomy.png')
    ctx.close()
    # retry (خطأ) 1366
    ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.route('**/products?*', lambda r: r.abort())
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(2200)
    p.evaluate('document.body.focus()')
    tab_until(p, '#shop-view .state .btn', 40)
    print('retry:', ring(p)); p.screenshot(path=OUT+'/kf-1366-retry.png')
    ctx.close()
    b.close()
