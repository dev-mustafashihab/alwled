
import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3f'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for w,theme in [(1366,'light'),(1366,'dark'),(390,'light')]:
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar')
        if theme=='dark': ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        p=ctx.new_page(); p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1400)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1800)
        # تركيز فعلي بلوحة المفاتيح
        p.keyboard.press('Tab'); p.wait_for_timeout(150)
        for _ in range(3): p.keyboard.press('Tab'); p.wait_for_timeout(120)
        R['focus_%d_%s'%(w,theme)] = p.evaluate("""(() => { const a=document.activeElement; if(!a) return null; const cs=getComputedStyle(a);
          return {tag:a.tagName, cls:a.className, text:(a.textContent||'').trim().slice(0,20),
            outline: cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor, shadow: cs.boxShadow.slice(0,60)}; })()""")
        # حالة focus على شريحة الاختيار + بطاقة التصنيف
        p.evaluate('location.hash = "#/products?view=categories"'); p.wait_for_timeout(1800)
        R['taxo_hover_%d_%s'%(w,theme)] = p.evaluate("""(() => { const el=document.querySelector('.shop-taxonomy__item'); if(!el) return null;
          const ev=new MouseEvent('mouseover',{bubbles:true}); el.dispatchEvent(ev);
          const cs=getComputedStyle(el); return {border: cs.borderTopColor, bg: cs.backgroundColor, color: cs.color}; })()""")
        ctx.close()
    # شريحة الاختيار: checked في الوضعين
    for theme in ('light','dark'):
        ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar')
        if theme=='dark': ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        p=ctx.new_page(); p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1400)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1800)
        R['check_%s'%theme] = p.evaluate("""(() => { const c=document.querySelector('.shop-check'); const cs=getComputedStyle(c);
          return {bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor}; })()""")
        p.check('#shop-filter-offers'); p.wait_for_timeout(1700)
        R['check_checked_%s'%theme] = p.evaluate("""(() => { const c=document.querySelector('.shop-check'); const cs=getComputedStyle(c);
          return {bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, checked: c.querySelector('input').checked}; })()""")
        ctx.close()
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
