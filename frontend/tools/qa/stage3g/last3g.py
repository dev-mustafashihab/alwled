import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar'); p=ctx.new_page()
    reqs=[]; p.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1900)
    # inStock من الواجهة
    reqs.clear()
    p.evaluate("document.getElementById('shop-filters-toggle').click()"); p.wait_for_timeout(700)
    p.evaluate("document.getElementById('shop-filter-instock').click()"); p.wait_for_timeout(2000)
    R['instock']={'reqs':list(reqs),'hash':p.evaluate('location.hash'),'cards':p.evaluate("document.querySelectorAll('#shop-view > .shop-grid .shop-card').length"),
                  'count':p.evaluate("(() => { const c=document.querySelector('.shop-toolbar__count'); return c?c.textContent.trim():null; })()")}
    print('inStock:',R['instock'])
    # offers
    p.evaluate("document.getElementById('shop-filters-toggle').click()"); p.wait_for_timeout(700)
    reqs.clear()
    p.evaluate("document.getElementById('shop-filter-offers').click()"); p.wait_for_timeout(2000)
    R['offers']={'reqs':list(reqs),'hash':p.evaluate('location.hash'),'cards':p.evaluate("document.querySelectorAll('#shop-view > .shop-grid .shop-card').length"),
                 'count':p.evaluate("(() => { const c=document.querySelector('.shop-toolbar__count'); return c?c.textContent.trim():null; })()")}
    print('offers:',R['offers'])
    # تمرير داخلي للوحة + فائض أفقي داخلها
    p.evaluate("document.getElementById('shop-filters-toggle').click()"); p.wait_for_timeout(800)
    R['sheet_scroll']=p.evaluate("""(() => { const s=document.querySelector('.shop-filters__sheet');
      return {scrollH: Math.round(s.scrollHeight), clientH: Math.round(s.clientHeight), scrollW: Math.round(s.scrollWidth), clientW: Math.round(s.clientWidth),
        overflowY: getComputedStyle(s).overflowY, overflowX: getComputedStyle(s).overflowX}; })()""")
    print('sheet:',R['sheet_scroll'])
    R['sheet_nested_overflow']=p.evaluate("""(() => { const bad=[]; document.querySelectorAll('.shop-filters__sheet *').forEach(el=>{
      if (el.scrollWidth - el.clientWidth > 2 && getComputedStyle(el).overflowX !== 'visible') bad.push(String(el.className).slice(0,30)); }); return bad; })()""")
    print('nested h-scroll:',R['sheet_nested_overflow'])
    p.keyboard.press('Escape'); p.wait_for_timeout(600)
    # أثناء التحميل: هل يوجد توقف تركيز على الهياكل؟
    p.route('**/products?*', lambda r: None)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1600)
    R['loading_focus_stops']=p.evaluate("""(() => { const out=[]; Array.from(document.querySelectorAll('a[href],button,input,select,[tabindex]')).forEach(el=>{
      const b=el.getBoundingClientRect(); if(b.width&&b.height&&!el.closest('.skeleton')) {} });
      const skel=Array.from(document.querySelectorAll('.skeleton')).filter(s=>s.tabIndex>=0||s.querySelector('a,button,input')).length; return skel; })()""")
    print('skeleton focus stops:',R['loading_focus_stops'])
    R['console']=[]
    b.close()
json.dump(R, open('/root/alwled/frontend/tools/qa/stage3g/last3g-after.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
