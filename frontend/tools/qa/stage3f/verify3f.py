import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for theme in ('light','dark'):
        ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar')
        if theme=='dark': ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        p=ctx.new_page(); p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1400)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1800)
        R['offers_chip_'+theme] = p.evaluate("""(() => { const i=document.getElementById('shop-filter-offers'); const c=i.closest('.shop-check');
          const cs=getComputedStyle(c); return {checked:i.checked, bg:cs.backgroundColor, color:cs.color, border:cs.borderTopColor}; })()""")
        p.check('#shop-filter-offers'); p.wait_for_timeout(2000)
        R['offers_chip_checked_'+theme] = p.evaluate("""(() => { const i=document.getElementById('shop-filter-offers'); const c=i.closest('.shop-check');
          const cs=getComputedStyle(c); return {checked:i.checked, bg:cs.backgroundColor, color:cs.color, border:cs.borderTopColor}; })()""")
        # hover على بطاقة تصنيف (حالة CSS حقيقية)
        p.evaluate('location.hash = "#/products?view=categories"'); p.wait_for_timeout(1800)
        p.hover('.shop-taxonomy__item'); p.wait_for_timeout(500)
        R['taxo_hover_'+theme] = p.evaluate("""(() => { const el=document.querySelector('.shop-taxonomy__item'); const cs=getComputedStyle(el);
          return {border:cs.borderTopColor, bg:cs.backgroundColor, transform:cs.transform, shadow:cs.boxShadow.slice(0,40)}; })()""")
        # تركيز بطاقة تصنيف بلوحة المفاتيح
        p.keyboard.press('Tab'); p.keyboard.press('Tab'); p.wait_for_timeout(400)
        R['taxo_focus_'+theme] = p.evaluate("""(() => { const a=document.activeElement; const cs=getComputedStyle(a);
          return {cls:a.className, outline:cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor, shadow:cs.boxShadow.slice(0,40), border:cs.borderTopColor}; })()""")
        p.screenshot(path='/root/alwled/frontend/tools/qa/stage3f/after-taxo-hover-%s.png'%theme)
        ctx.close()
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
