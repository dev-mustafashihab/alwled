import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for w in (390,1366):
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2200)
        p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(2600)
        R['pdp_%d'%w]=p.evaluate("""(() => { const g=s=>{const e=document.querySelector(s); return e? getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g,'') : null;};
          const c=document.querySelector('.shop-buy__actions .btn--primary'); const cb=c?c.getBoundingClientRect():null;
          return {title:g('.shop-buy__title'), price:g('.shop-buy__price .shop-price__now'), btn:g('.shop-buy__actions .btn--primary'),
            btn_box: cb?[Math.round(cb.width),Math.round(cb.height)]:null, title_fs:getComputedStyle(document.querySelector('.shop-buy__title')).fontSize,
            prose:g('.shop-prose')}; })()""")
        # نافذة المصادقة (زائر)
        try:
            p.click('#shop-add-to-cart'); p.wait_for_timeout(1500)
            R['auth_%d'%w]=p.evaluate("""(() => { const dlgs=document.querySelectorAll('[role=dialog], .modal, .shop-modal, .shop-auth');
              const out=[]; dlgs.forEach(d=>{ const btns=Array.from(d.querySelectorAll('.btn, button'));
                btns.forEach(x=>{const b=x.getBoundingClientRect(); if(b.width) out.push({cls:String(x.className).slice(0,26), text:(x.textContent||'').trim().slice(0,16), box:[Math.round(b.width),Math.round(b.height)], bg:getComputedStyle(x).backgroundColor});});});
              return {dlgs:dlgs.length, btns:out.slice(0,4)}; })()""")
        except Exception as e:
            R['auth_%d'%w]='click-failed: '+str(e)[:60]
        ctx.close()
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1)[:1600])
