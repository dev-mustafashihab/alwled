
import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3e'
import sys
MODE=sys.argv[1]
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    # اسم علامة طويل + بطاقة عدّاد صفر (جلسة الفحص فقط)
    for w in (390,1366):
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1300)
        p.evaluate('location.hash = "#/products?view=brands"'); p.wait_for_timeout(1700)
        p.evaluate("""(() => { const its=document.querySelectorAll('#shop-view > .shop-taxonomy > .shop-taxonomy__item');
          if (its[0]) its[0].querySelector('.shop-taxonomy__name').textContent='علامة تجريبية طويلة جدًا لاختبار الالتفاف في واجهة عربية'; })()""")
        p.wait_for_timeout(400)
        d=p.evaluate("""(() => { const its=Array.from(document.querySelectorAll('#shop-view > .shop-taxonomy > .shop-taxonomy__item'));
          const i=its[0]; const n=i.querySelector('.shop-taxonomy__name');
          return {cardH:Math.round(i.getBoundingClientRect().height), nameH:Math.round(n.getBoundingClientRect().height),
            ov:document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()""")
        R['brand_long_%d'%w]=d
        p.screenshot(path='%s/%s-brands-longname-%d.png'%(OUT,MODE,w))
        print('brand long %d: %s' % (w,d))
        # عدّاد صفر: التصنيف 292 (0 منتج) — قصّ البطاقة
        p.evaluate('location.hash = "#/products?view=categories"'); p.wait_for_timeout(1700)
        d2=p.evaluate("""(() => { const its=Array.from(document.querySelectorAll('#shop-view > .shop-taxonomy > .shop-taxonomy__item'));
          const zero=its.find(i=>/^0 منتج/.test((i.querySelector('.shop-taxonomy__count')||{}).textContent||''));
          if(!zero) return null; const b=zero.getBoundingClientRect();
          return {text:(zero.textContent||'').trim().replace(/\\s+/g,' '), w:Math.round(b.width), h:Math.round(b.height), y:Math.round(b.y)}; })()""")
        R['zero_count_%d'%w]=d2
        print('zero count %d: %s' % (w,d2))
        if d2:
            p.screenshot(path='%s/%s-zerocount-%d.png'%(OUT,MODE,w), clip={'x':max(0,d2['w'] and 0),'y':max(0,d2['y']-40),'width':w,'height':200})
        ctx.close()
    b.close()
json.dump(R, open('%s/extra3e-%s.json'%(OUT,MODE),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
